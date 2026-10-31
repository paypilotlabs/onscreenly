// Runs one AI feature (say, assist, ask, recap, leetcode...): gathers screen
// and transcript context, streams the answer to the renderer, and guards
// against stalled providers.
const store = require('../../src/storage/store');
const { captureScreenshot } = require('../../src/capture/screen');
const { createLLM } = require('../../src/llm/llm');
const { MODES } = require('../../src/llm/prompts');
const { buildInterviewContext, detectCategory } = require('../../src/context/interview-context');
const publik = require('../../src/integrations/publik');
const { recordEvent } = require('../../src/integrations/applink');
const { session, send } = require('./session');
const { DEFAULTS: SHORTCUT_DEFAULTS, resolveShortcuts, displayAccelerator } = require('../../src/platform/shortcuts');
const publikController = require('./publik-controller');
const { retrieveNotes } = require('./knowledge');

const STREAM_INACTIVITY_MS = 25000; // abort a stalled LLM stream so state.busy can't wedge forever
// The steps before the stream (screenshot, note search) get their own limits: a hung step there
// used to leave state.busy set for good, so every later question was silently dropped.
const SCREENSHOT_TIMEOUT_MS = 10000;
const NOTES_TIMEOUT_MS = 5000;

// The answer being produced, so Stop (llm:cancel) can cancel the request itself.
let current = null;

function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_res, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    })
  ]).finally(() => clearTimeout(timer));
}

function captureFailedMessage() {
  return process.platform === 'darwin'
    ? 'Screen capture needs permission — grant Screen Recording to Onscreenly in System Settings.'
    : process.platform === 'win32'
      ? 'Screen capture failed. Make sure Onscreenly is not blocked by Windows privacy or security software, then try again.'
      : 'Screen capture failed. Check your desktop capture permissions, then try again.';
}

let adding = false;
/**
 * Add screen: keeps the visible part of a coding problem that is longer than the screen. The user
 * scrolls and adds the next part; the next LeetCode solve sends every part with what is visible then.
 */
async function addProblemScreen() {
  const screens = session.problemScreens;
  if (adding) return;
  if (screens.count() >= screens.max) {
    send('problem:screens', { count: screens.count(), max: screens.max, full: true });
    return;
  }
  adding = true;
  try {
    const dataUrl = await withTimeout(captureScreenshot(), SCREENSHOT_TIMEOUT_MS, 'Screen capture timed out.');
    if (!dataUrl) throw new Error('No screen source was available.');
    const { count } = screens.add(dataUrl);
    send('problem:screens', { count, max: screens.max });
  } catch (e) {
    recordEvent({
      level: 'error',
      event: 'screen_capture_failed',
      msg: e && e.message ? e.message : String(e),
      frame: 'addProblemScreen',
      context: { mode: 'leetcode' }
    });
    send('status', { message: captureFailedMessage() });
  } finally {
    adding = false;
  }
}

/** Stops the answer in progress: cancels the provider request and settles the answer as stopped. */
function cancelCurrent() {
  if (current) current.cancel();
}

async function runFeature(mode, userText) {
  const { state, transcript } = session;
  if (state.busy) {
    send('status', { message: 'Still answering the previous question. Stop it (Esc) or wait for it to finish.' });
    return;
  }
  const def = MODES[mode];
  if (!def) return;
  state.busy = true;
  const controller = new AbortController();
  let cancelled = false;
  let cancelStream = () => {};
  current = {
    cancel() {
      cancelled = true;
      controller.abort();
      cancelStream();
    }
  };
  let streamSettled = false; // drop stray tokens from a stream we've already abandoned
  let streamStarted = false;
  let receivedTokens = false;
  try {
    const settings = store.getSettings();
    const llm = createLLM(settings);
    // LeetCode: the parts of a long problem added before (Add screen), oldest first.
    const parts = mode === 'leetcode' ? session.problemScreens.list() : [];
    const userBubble = parts.length
      ? `Solve what's on screen (${parts.length + 1} screens)`
      : def.userBubble !== null
        ? def.userBubble
        : mode === 'ask'
          ? userText
          : mode === 'answerThis'
            ? `"${(userText || '').slice(0, 60)}${userText && userText.length > 60 ? '…' : ''}"`
            : null;
    const category = mode !== 'leetcode' && !def.ownContext ? detectCategory(transcript) : null;
    // `mode` picks the renderer's thinking label ("Reading the conversation…").
    send('llm:start', { userBubble, small: !!def.small, category, layout: def.layout || null, mode });

    // Every error the user can fix carries a `code`; the renderer turns it into one button under the
    // answer (Open settings, Open Profile, Start session, Try again). An `action` (publik) instead
    // opens the banner or the card that owns the next step, so it never gets a code.
    if (def.needsResume && !String(settings.resumeText || '').trim()) {
      send('llm:error', {
        message: 'Add your résumé in Settings › Profile first, then try again.',
        code: 'needs-resume'
      });
      return;
    }

    if (!llm.ready) {
      const message =
        llm.configurationError ||
        'Complete the ' + settings.provider + ' provider settings. Model: ' + (llm.model || 'unset') + '.';
      if (settings.provider === publik.PUBLIK_PROVIDER) {
        // No key yet: either the disclosure was never accepted (open it — the
        // mint happens only on "Continue"), or the install was revoked or the
        // last mint failed (offer Reconnect). The app never silently spends.
        const action = !settings.publik.disclosureAccepted
          ? { kind: 'disclosure' }
          : { kind: 'reconnect', label: 'Reconnect' };
        send('llm:error', { message, action });
        return;
      }
      send('llm:error', { message, code: 'no-provider' });
      return;
    }
    // Never a silent starter (CONTRACT §12.4): the first-run card — balance,
    // justification, "Link this computer & pick a plan" / "Later" — is shown
    // at least once before any starter usage is spent. Normally it appears
    // right after provisioning; this gate catches a card that was never
    // acknowledged (e.g. an install provisioned by an earlier release).
    if (settings.provider === publik.PUBLIK_PROVIDER && settings.apiKeys.publik && !settings.publik.cardShown) {
      send('llm:error', {
        message: 'publik API is set up. Take a look at the card, then ask again.',
        action: { kind: 'card' }
      });
      return;
    }

    let imageDataUrl = null;
    if (def.needsScreen) {
      try {
        imageDataUrl = await withTimeout(captureScreenshot(), SCREENSHOT_TIMEOUT_MS, 'Screen capture timed out.');
        if (!imageDataUrl) throw new Error('No screen source was available.');
      } catch (e) {
        imageDataUrl = null;
        recordEvent({
          level: 'error',
          event: 'screen_capture_failed',
          msg: e && e.message ? e.message : String(e),
          frame: 'captureScreenshot',
          context: { mode }
        });
        const message = captureFailedMessage();
        // LeetCode reads the problem from the screen; without it (and no parts added) there is nothing to solve.
        if (def.requiresScreen && !parts.length) {
          send('llm:error', { message, code: 'needs-screen' });
          return;
        }
        send('status', { message });
      }
    }
    if (cancelled) return;
    const images = [...parts, ...(imageDataUrl ? [imageDataUrl] : [])];

    // Follow-up / Recap have nothing to work with before anything was heard —
    // sent to the model anyway, it fabricates plausible generic output that
    // looks like a canned preset. Say so instead, and log how much context
    // every feature actually ran with.
    console.log(`[llm] mode=${mode} transcriptTurns=${transcript.length} capturing=${state.capturing}`);
    if (def.transcriptRequired && transcript.length === 0) {
      send(
        'llm:error',
        state.capturing
          ? {
              message: 'Nothing has been transcribed yet. Say something, or let the other side talk, then try again.',
              code: 'needs-speech'
            }
          : {
              message: 'Nothing has been captured yet. Start a session so Onscreenly can hear the conversation.',
              code: 'needs-session'
            }
      );
      return;
    }

    const settingsForPrompt = store.getSettings();
    const ctx = {
      transcript,
      userText: userText || '',
      settings: settingsForPrompt,
      screenCount: images.length,
      // The user's Add screen keys as they read them, so a cut-off solve can say which keys to press.
      addScreenKeys:
        mode === 'leetcode'
          ? displayAccelerator(
              resolveShortcuts(settingsForPrompt.shortcuts || {}).leetcodeAdd || SHORTCUT_DEFAULTS.leetcodeAdd
            )
          : ''
    };
    // Modes with their own context (résumé analysis) put the full documents in
    // the user turn and skip the clipped interview excerpts and meeting memory.
    let contextBlock = def.ownContext ? null : buildInterviewContext(settingsForPrompt, mode, transcript);
    // Summaries of the last few meetings, so "what did we agree last time?"
    // has something to draw on. Never the current meeting, never leetcode.
    const memoryBlock =
      mode !== 'leetcode' && !def.ownContext && session.meetingMemory ? session.meetingMemory.memoryBlock() : null;
    if (memoryBlock) contextBlock = contextBlock ? contextBlock + '\n\n' + memoryBlock : memoryBlock;
    // Matching notes from the user's Obsidian vault, when Knowledge is on.
    const notes = await withTimeout(retrieveNotes(mode, ctx), NOTES_TIMEOUT_MS, 'note search timed out').catch((e) => {
      console.warn('[knowledge] note search failed:', e && e.message);
      return { block: '', sources: [] };
    });
    if (cancelled) return;
    if (notes.block) contextBlock = contextBlock ? contextBlock + '\n\n' + notes.block : notes.block;
    console.log(`[llm] notes=${notes.sources.length}`);
    const system = def.buildSystem ? def.buildSystem(contextBlock, settingsForPrompt.aiRules || '') : def.system || '';
    let built = def.build(ctx);
    // A mode that looks at the screen, run without a screenshot: say so, so the answer does not
    // describe a screenshot it never saw.
    if (def.needsScreen && !images.length) {
      built += '\n\n(No screenshot is attached: screen capture was unavailable. Do not refer to a screenshot.)';
    }

    // Watchdog: a provider that stalls mid-stream would otherwise hang the await forever,
    // leaving state.busy = true and wedging every later question until an app restart.
    let watchdog = null;
    let rearm = () => {};
    const stalled = new Promise((_res, reject) => {
      rearm = () => {
        clearTimeout(watchdog);
        watchdog = setTimeout(() => {
          // Cancel the request itself, not only the wait for it: an abandoned stream would keep
          // generating (and billing) after the user is told it timed out.
          controller.abort();
          reject(new Error('the model stopped responding (timed out). Please try again.'));
        }, STREAM_INACTIVITY_MS);
      };
      rearm();
      cancelStream = () => reject(Object.assign(new Error('Stopped.'), { stopped: true }));
    });
    // A failure from here on is the provider's, and worth a retry. Once part of the answer has
    // arrived, the answer was interrupted rather than refused.
    streamStarted = true;
    let truncated = false;
    let answer = '';
    try {
      await Promise.race([
        llm.stream({
          system,
          turns: [{ role: 'user', text: built }],
          imageDataUrls: images,
          signal: controller.signal,
          ...(def.maxTokens ? { maxTokens: def.maxTokens } : {}),
          onToken: (t) => {
            if (streamSettled) return;
            rearm();
            receivedTokens = true;
            answer += t;
            send('llm:token', { text: t });
          },
          // A reasoning model thinks before it writes: that is progress, not a stall.
          onActivity: () => {
            if (!streamSettled) rearm();
          },
          onFinish: (info) => {
            truncated = !!(info && info.truncated);
          },
          onResponse:
            settings.provider === publik.PUBLIK_PROVIDER
              ? (res) => publikController.publikNoteHeaders(res && res.headers)
              : undefined
        }),
        stalled
      ]);
    } finally {
      streamSettled = true;
      clearTimeout(watchdog);
    }
    if (!answer.trim()) {
      throw new Error('The model returned an empty answer. Try again, or pick another model in Settings.');
    }
    send('llm:done', { sources: notes.sources, truncated });
    // A whole solve lets go of the parts it sent; a part added while it was answering stays. One that
    // was cut off at the length limit, or that says part of the problem is missing, keeps them (and
    // keeps them fresh), so the user can add the rest and solve again. Failed or stopped solves keep
    // them for Try again.
    if (parts.length) {
      const missing = /^\s*\**Missing:/im.test(answer);
      if (truncated || missing) session.problemScreens.touch();
      else session.problemScreens.release(parts.length);
    }
    // Streams settle after their headers, so the charge is reconciled from
    // GET /wallet shortly after the answer — one request per answer, debounced.
    if (settings.provider === publik.PUBLIK_PROVIDER) publikController.publikScheduleWalletRefresh();
  } catch (e) {
    // Stop: keep what arrived, marked as stopped. Never an error.
    if (cancelled) {
      send('llm:done', { stopped: true });
      return;
    }
    recordEvent({
      level: 'error',
      event: 'llm_failed',
      msg: e && e.message ? e.message : String(e),
      frame: 'runFeature',
      context: { mode, provider: store.getSettings().provider }
    });
    const action = e && e.action ? e.action : null;
    const code =
      action || !streamStarted ? undefined : e && e.code ? e.code : receivedTokens ? 'interrupted' : 'provider-failed';
    send('llm:error', { message: e && e.message ? e.message : String(e), action, code });
    if (action) publikController.publikHandleErrorAction(action);
  } finally {
    streamSettled = true;
    state.busy = false;
    current = null;
    // A Stop that came before the stream started: the renderer is still waiting for an end.
    if (cancelled && !streamStarted) send('llm:done', { stopped: true });
  }
}

module.exports = { runFeature, cancelCurrent, addProblemScreen, STREAM_INACTIVITY_MS };
