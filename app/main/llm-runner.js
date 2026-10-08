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
const publikController = require('./publik-controller');
const { retrieveNotes } = require('./knowledge');

const STREAM_INACTIVITY_MS = 25000; // abort a stalled LLM stream so state.busy can't wedge forever

async function runFeature(mode, userText) {
  const { state, transcript } = session;
  if (state.busy) return;
  const def = MODES[mode];
  if (!def) return;
  state.busy = true;
  let streamSettled = false; // drop stray tokens from a stream we've already abandoned
  let streamStarted = false;
  let receivedTokens = false;
  try {
    const settings = store.getSettings();
    const llm = createLLM(settings);
    const userBubble =
      def.userBubble !== null
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
        imageDataUrl = await captureScreenshot();
        if (!imageDataUrl) throw new Error('No screen source was available.');
      } catch (e) {
        recordEvent({
          level: 'error',
          event: 'screen_capture_failed',
          msg: e && e.message ? e.message : String(e),
          frame: 'captureScreenshot',
          context: { mode }
        });
        const message =
          process.platform === 'darwin'
            ? 'Screen capture needs permission — grant Screen Recording to Onscreenly in System Settings.'
            : process.platform === 'win32'
              ? 'Screen capture failed. Make sure Onscreenly is not blocked by Windows privacy or security software, then try again.'
              : 'Screen capture failed. Check your desktop capture permissions, then try again.';
        send('status', { message });
      }
    }

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
    const ctx = { transcript, userText: userText || '', settings: settingsForPrompt };
    // Modes with their own context (résumé analysis) put the full documents in
    // the user turn and skip the clipped interview excerpts and meeting memory.
    let contextBlock = def.ownContext ? null : buildInterviewContext(settingsForPrompt, mode, transcript);
    // Summaries of the last few meetings, so "what did we agree last time?"
    // has something to draw on. Never the current meeting, never leetcode.
    const memoryBlock =
      mode !== 'leetcode' && !def.ownContext && session.meetingMemory ? session.meetingMemory.memoryBlock() : null;
    if (memoryBlock) contextBlock = contextBlock ? contextBlock + '\n\n' + memoryBlock : memoryBlock;
    // Matching notes from the user's Obsidian vault, when Knowledge is on.
    const notes = await retrieveNotes(mode, ctx).catch((e) => {
      console.warn('[knowledge] note search failed:', e && e.message);
      return { block: '', sources: [] };
    });
    if (notes.block) contextBlock = contextBlock ? contextBlock + '\n\n' + notes.block : notes.block;
    console.log(`[llm] notes=${notes.sources.length}`);
    const system = def.buildSystem ? def.buildSystem(contextBlock, settingsForPrompt.aiRules || '') : def.system || '';
    const built = def.build(ctx);

    // Watchdog: a provider that stalls mid-stream would otherwise hang the await forever,
    // leaving state.busy = true and wedging every later question until an app restart.
    let watchdog = null;
    let rearm = () => {};
    const stalled = new Promise((_res, reject) => {
      rearm = () => {
        clearTimeout(watchdog);
        watchdog = setTimeout(
          () => reject(new Error('the model stopped responding (timed out). Please try again.')),
          STREAM_INACTIVITY_MS
        );
      };
      rearm();
    });
    // A failure from here on is the provider's, and worth a retry. Once part of the answer has
    // arrived, the answer was interrupted rather than refused.
    streamStarted = true;
    try {
      await Promise.race([
        llm.stream({
          system,
          turns: [{ role: 'user', text: built }],
          imageDataUrl,
          ...(def.maxTokens ? { maxTokens: def.maxTokens } : {}),
          onToken: (t) => {
            if (streamSettled) return;
            rearm();
            receivedTokens = true;
            send('llm:token', { text: t });
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
    send('llm:done', { sources: notes.sources });
    // Streams settle after their headers, so the charge is reconciled from
    // GET /wallet shortly after the answer — one request per answer, debounced.
    if (settings.provider === publik.PUBLIK_PROVIDER) publikController.publikScheduleWalletRefresh();
  } catch (e) {
    recordEvent({
      level: 'error',
      event: 'llm_failed',
      msg: e && e.message ? e.message : String(e),
      frame: 'runFeature',
      context: { mode, provider: store.getSettings().provider }
    });
    const action = e && e.action ? e.action : null;
    const code = action || !streamStarted ? undefined : receivedTokens ? 'interrupted' : 'provider-failed';
    send('llm:error', { message: e && e.message ? e.message : String(e), action, code });
    if (action) publikController.publikHandleErrorAction(action);
  } finally {
    streamSettled = true;
    state.busy = false;
  }
}

module.exports = { runFeature, STREAM_INACTIVITY_MS };
