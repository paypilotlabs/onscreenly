// Events pushed from the main process: capture, transcription, answers and status messages.
import { state } from './state.js';
import { onscreenly, setSessionButton } from './core.js';
import {
  MAX_RESPONSES,
  addAnswerExtras,
  appendToken,
  clearTranscriptInterim,
  finalizeAi,
  messages,
  noteStreamActivity,
  setBusy,
  showToast,
  startAi,
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

// The banner above the action row: a message, at most one action, and Dismiss.
let statusTimer = null;
function showStatus(message, button) {
  let el = document.getElementById('onscreenly-status');
  if (!el) {
    el = document.createElement('div');
    el.id = 'onscreenly-status';
    el.setAttribute('role', 'status');
    el.dataset.tone = 'info';
    const text = document.createElement('span');
    text.className = 'banner-msg';
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'banner-close';
    dismiss.title = 'Dismiss this message';
    dismiss.textContent = 'Dismiss';
    dismiss.addEventListener('click', () => {
      clearTimeout(statusTimer);
      el.classList.remove('show');
    });
    el.append(text, dismiss);
    document.getElementById('panel-main').insertBefore(el, document.getElementById('action-row'));
  }
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
  statusTimer = setTimeout(() => el.classList.remove('show'), button ? 30000 : 11000);
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
  onscreenly.on('slides:update', ({ count, last }) => {
    if (!count) return;
    const title = last && last.caption ? last.caption.split('\n')[0].slice(0, 80) : 'Slide ' + count;
    showToast(`Slide ${count} captured · ${title}`, 3000);
  });
  onscreenly.on('llm:start', ({ userBubble, small, category, layout }) => {
    state.responseCount++;
    if (state.responseCount > MAX_RESPONSES) {
      const oldest = messages.querySelector('.response-group');
      if (oldest) oldest.remove();
      state.responseCount = MAX_RESPONSES;
    }
    // The log scrolls itself (chat.js), never with scrollIntoView(): that scrolls every scrollable
    // ancestor too, and once the panel is tall enough it scrolls the document, pushing #toolbar
    // out of view. html/body are overflow:hidden, so nothing would bring the controls back.
    startResponseGroup({ question: userBubble, category, small, cards: layout === 'cards' });
    setBusy(true);
  });
  onscreenly.on('llm:token', ({ text }) => {
    noteStreamActivity();
    appendToken(text);
  });
  onscreenly.on('llm:done', ({ sources } = {}) => {
    const el = finalizeAi();
    if (el) addAnswerExtras(el, sources);
    setBusy(false);
  });
  onscreenly.on('llm:error', ({ message, action }) => {
    if (!state.aiEl) startAi(true);
    state.aiEl.dataset.raw = message;
    finalizeAi();
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
  onscreenly.on('status', ({ message }) => {
    onscreenly.log('[status] ' + message);
    showStatus(message);
    if (sttState !== 'disconnected') {
      const lower = message.toLowerCase();
      if (lower.includes('error') || lower.includes(' off')) setSttState('error');
    }
  });
}

export { showStatus };
