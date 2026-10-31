// Events pushed from the main process: capture, transcription, answers and status messages.
import { state } from './state.js';
import { $, combo, isMac, onscreenly, setSessionButton, shortcutKeys } from './core.js';
import {
  MAX_RESPONSES,
  addAnswerExtras,
  addAnswerNote,
  appendToken,
  clearTranscriptInterim,
  failAi,
  finalizeAi,
  messages,
  noteStreamActivity,
  runMode,
  setBusy,
  showToast,
  startResponseGroup
} from './chat.js';
import {
  autoFillInputFromSTT,
  cancelSoftClear,
  clearGhost,
  composer,
  input,
  showGhost,
  softClearSTTFill
} from './composer.js';
import { startMic, stopMic, stopSystemAudio } from './audio.js';
import { appendTranscriptHistoryTurn, setLiveDotState, setSttState, sttState, updateSttStatus } from './transcript.js';
import { publikActionButton } from './publik-settings.js';
import { showPublikCard } from './onboarding.js';
import { openSettings } from './settings-panel.js';
import { markUnread } from './toolbar.js';

// The banner above the action row: a message, at most one action, and Dismiss. `tone` is 'info',
// 'warn' or 'error' (read out at once).
let statusTimer = null;
function showStatus(message, button, tone = 'info') {
  let el = document.getElementById('onscreenly-status');
  if (!el) {
    el = document.createElement('div');
    el.id = 'onscreenly-status';
    const text = document.createElement('span');
    text.className = 'banner-msg';
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'banner-close';
    dismiss.title = 'Dismiss this message';
    dismiss.textContent = 'Dismiss';
    dismiss.addEventListener('click', hideStatus);
    el.append(text, dismiss);
    document.getElementById('panel-main').insertBefore(el, document.getElementById('action-row'));
  }
  el.dataset.tone = tone;
  el.setAttribute('role', tone === 'error' ? 'alert' : 'status');
  el.querySelector('.banner-msg').textContent = message;
  const previous = el.querySelector('.banner-action');
  if (previous) previous.remove();
  if (button) {
    button.type = 'button';
    button.classList.add('btn', 'btn-secondary', 'compact', 'banner-action');
    el.querySelector('.banner-close').before(button);
  }
  // Restart the rise-in when one message replaces another.
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(statusTimer);
  // Warnings and errors stay until dismissed: they can need reading slowly, or with a screen reader.
  if (tone === 'info') statusTimer = setTimeout(hideStatus, button ? 30000 : 11000);
}

function hideStatus() {
  clearTimeout(statusTimer);
  const el = document.getElementById('onscreenly-status');
  if (el) el.classList.remove('show');
}

// A warning about listening, with the way to fix it: Settings › Audio.
function showAudioStatus(message) {
  const button = document.createElement('button');
  button.textContent = 'Open Audio settings';
  button.addEventListener('click', () => {
    hideStatus();
    openSettings('transcription');
  });
  showStatus(message, button, 'warn');
}

// ---- answer errors ---------------------------------------------------------
// The button under a failed answer, from the code main gave the error. No code, no button: an error
// with an action (publik) leaves the next step to its banner or card.
function fixFor(code, run) {
  switch (code) {
    case 'no-provider':
      return { label: 'Open settings', run: () => openSettings('keys') };
    case 'needs-resume':
      return { label: 'Open Profile', run: () => openSettings('profile') };
    case 'needs-session':
      return {
        label: 'Start session',
        run: () => {
          const stop = $('#stop-btn');
          if (!stop.classList.contains('active')) stop.click();
        }
      };
    case 'needs-speech':
      return noSpeechToText() ? { label: 'Open Audio settings', run: () => openSettings('transcription') } : null;
    case 'needs-screen':
      return isMac
        ? {
            label: 'Open Privacy settings',
            run: () =>
              onscreenly.openPane('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')
          }
        : run
          ? { label: 'Try again', run: () => runMode(run.mode, run.text) }
          : null;
    case 'provider-failed':
    case 'interrupted':
      return run ? { label: 'Try again', run: () => runMode(run.mode, run.text) } : null;
    default:
      return null;
  }
}

// Nothing can transcribe: no speech-to-text key and no local model (#panel[data-listen], boot.js).
function noSpeechToText() {
  return $('#panel').dataset.listen === 'none';
}

export function init() {
  // ---- events from main --------------------------------------------------
  onscreenly.on('capture:state', ({ active, streaming, mode }) => {
    setLiveDotState(active ? 'idle' : 'off');
    setSessionButton(active);
    // FIX #4: Add .listening class to composer when capture is active
    composer.classList.toggle('listening', active);
    // startSystemAudio() is called directly from the stop-button click handler
    // so that the getDisplayMedia request has a fresh user gesture.
    // Here we only start the mic (no gesture required) and stop everything on deactivate.
    if (active) {
      startMic();
      // Don't auto-open sidebar — user can toggle it manually
    } else {
      stopMic();
      stopSystemAudio();
      clearGhost();
      // Don't auto-close sidebar — let user keep it open if they want
    }
    if (active && mode === 'local') setSttState('local');
    else updateSttStatus({ active, streaming });
  });

  onscreenly.on('stt:interim', ({ channel, text }) => {
    setLiveDotState('speaking');
    appendTranscriptHistoryTurn(channel, text, true); // update sidebar interim

    // Live speech shows once: the other side's words as ghost text in the empty composer.
    if (channel === 'them' && !input.value.trim()) showGhost(text);
  });
  onscreenly.on('stt:final', () => {
    setLiveDotState('idle');
    clearTranscriptInterim();
    clearGhost();
    // sidebar: the final turn is added via the 'transcript' event below
  });
  onscreenly.on('stt:status', ({ channel, status, provider }) => {
    onscreenly.log(`[stt] ${provider || channel || 'unknown'} ${status}`);
    if (provider === 'local') {
      const localStates = {
        loading: 'loading',
        ready: 'local',
        transcribing: 'local',
        stopping: 'stopping',
        off: 'disconnected',
        error: 'error'
      };
      if (localStates[status]) setSttState(localStates[status]);
      if (status === 'loading') setSessionButton(true);
      if (status === 'off' || status === 'error') setSessionButton(false);
      if (status === 'transcribing') setLiveDotState('speaking');
      if (status === 'loading' || status === 'ready' || status === 'stopping') setLiveDotState('idle');
      if (status === 'off') setLiveDotState('off');
      return;
    }
    if (status === 'connected') setSttState('streaming');
  });
  onscreenly.on('vad:state', ({ channel, speaking }) => {
    setLiveDotState(speaking ? 'speaking' : 'idle');
  });
  // "Slide 3 · <caption>": on screen the caption stops at 60 characters; screen readers get all of it.
  onscreenly.on('slides:update', ({ count, last }) => {
    if (!count) return;
    const caption = last && last.caption ? last.caption.split('\n')[0].trim() : '';
    if (!caption) {
      showToast(`Slide ${count}`, 3000);
      return;
    }
    const shown = caption.length > 60 ? caption.slice(0, 60).trimEnd() + '…' : caption;
    showToast(`Slide ${count} · ${caption}`, 3000, null, `Slide ${count} · ${shown}`);
  });
  onscreenly.on('llm:start', ({ userBubble, small, category, layout, mode }) => {
    state.responseCount++;
    if (state.responseCount > MAX_RESPONSES) {
      const oldest = messages.querySelector('.response-group');
      if (oldest) oldest.remove();
      state.responseCount = MAX_RESPONSES;
    }
    // The log scrolls itself (chat.js), never with scrollIntoView(): that scrolls every scrollable
    // ancestor too, and once the panel is tall enough it scrolls the document, pushing #toolbar
    // out of view. html/body are overflow:hidden, so nothing would bring the controls back.
    startResponseGroup({ question: userBubble, category, small, cards: layout === 'cards', mode });
    markUnread();
    // A global shortcut asks from main, not through runMode: "Try again" repeats it too.
    if (mode && (!state.lastRun || state.lastRun.mode !== mode)) state.lastRun = { mode, text: '' };
    setBusy(true);
  });
  onscreenly.on('llm:token', ({ text }) => {
    noteStreamActivity();
    appendToken(text);
  });
  onscreenly.on('llm:done', ({ sources, truncated, stopped } = {}) => {
    const el = finalizeAi(stopped ? 'stopped' : 'done');
    if (el) {
      if (!stopped) addAnswerExtras(el, sources);
      if (stopped) addAnswerNote(el, 'Stopped.');
      else if (truncated) {
        addAnswerNote(
          el,
          'This answer reached the length limit and was cut off. Ask for the rest, or turn on Smart for longer answers.'
        );
      }
    }
    setBusy(false);
  });
  onscreenly.on('llm:error', ({ message, action, code }) => {
    // Without speech-to-text, "say something" would not help: say why nothing was heard.
    const text =
      code === 'needs-speech' && noSpeechToText()
        ? 'Nothing has been transcribed. No speech-to-text is set up, so Onscreenly can’t hear the conversation.'
        : message;
    failAi(text, { code, fix: action ? null : fixFor(code, state.lastRun) });
    setBusy(false);
    // publik errors carry one action: the renderer's markdown emits no anchors,
    // so a link needs a real button (same pattern as the mic banner).
    if (action && action.kind === 'card') {
      showPublikCard();
      return;
    }
    if (action && action.kind) showStatus(message, publikActionButton(action));
  });
  onscreenly.on('transcript', ({ channel, text }) => {
    if (!text || text.trim().length < 2 || /^[?!.,;:\-…]+$/.test(text.trim())) return;
    appendTranscriptHistoryTurn(channel, text, false);
    // Auto-fill the input box with Them (interviewer) speech
    if (channel === 'them') {
      cancelSoftClear(); // Interviewer is speaking, cancel any pending clear
      autoFillInputFromSTT(text);
    } else {
      // User spoke — soft clear (don't immediately wipe, wait to see if they're really answering)
      softClearSTTFill();
    }
  });
  // Transcript of a meeting resumed at launch: sidebar rows only — no
  // auto-fill of the input box, which is for live speech.
  onscreenly.on('transcript:restore', ({ turns }) => {
    for (const t of turns || []) {
      if (!t || !t.text || t.text.trim().length < 2) continue;
      appendTranscriptHistoryTurn(t.channel, t.text, false);
    }
  });
  // Add screen kept one part of a long coding problem: say how many, and how to solve with them.
  onscreenly.on('problem:screens', ({ count, max, full }) => {
    const solve = combo(...shortcutKeys('leetcode'));
    const add = combo(...shortcutKeys('leetcodeAdd'));
    if (full) {
      showToast(`${max} screens kept, the most there can be. Solve now with ${solve}.`, 4000);
      return;
    }
    const message = `Screen ${count} of the problem kept. Scroll and press ${add} for the next part, or solve with ${solve}.`;
    showToast(message, 4000, 'ok', `Screen ${count} kept · solve with ${solve}`);
  });
  onscreenly.on('status', ({ message, code }) => {
    onscreenly.log('[status] ' + message);
    // A session that nothing can transcribe: "No speech-to-text", and the way to set it up.
    if (code === 'stt-unavailable') {
      setSttState('unavailable');
      showAudioStatus(message);
      return;
    }
    // Meeting history could not be saved or loaded: the controls are under Your data.
    if (code === 'meetings') {
      const button = document.createElement('button');
      button.textContent = 'Open Your data';
      button.addEventListener('click', () => {
        hideStatus();
        openSettings('keys');
        const row = document.getElementById('meeting-history');
        if (row) row.scrollIntoView({ block: 'center' });
      });
      showStatus(message, button, 'warn');
      return;
    }
    showStatus(message);
    if (sttState !== 'disconnected') {
      const lower = message.toLowerCase();
      if (lower.includes('error') || lower.includes(' off')) setSttState('error');
    }
  });
}

export { showAudioStatus, showStatus };
