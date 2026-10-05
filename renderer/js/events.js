// Events pushed from the main process: capture, transcription, answers and status messages.
import { state } from './state.js';
import { onscreenly, setSessionButton } from './core.js';
import {
  MAX_RESPONSES,
  appendToken,
  clearTranscriptInterim,
  finalizeAi,
  messages,
  setBusy,
  showToast,
  startAi
} from './chat.js';
import { autoFillInputFromSTT, cancelSoftClear, composer, input, softClearSTTFill } from './composer.js';
import { startMic, stopMic, stopSystemAudio } from './audio.js';
import { appendTranscriptHistoryTurn, setLiveDotState, setSttState, sttState, updateSttStatus } from './transcript.js';
import { publikActionButton } from './publik-settings.js';
import { showPublikCard } from './onboarding.js';

// ---- real-time transcript display (interim + final) ----
let interimEl = null;
function getOrCreateInterimEl() {
  if (!interimEl) {
    interimEl = document.createElement('div');
    interimEl.className = 'interim-transcript';
    // Insert into panel-main (the left column), before the action row
    const panelMain = document.getElementById('panel-main');
    const actionRow = document.getElementById('action-row');
    if (panelMain && actionRow && actionRow.parentNode === panelMain) {
      panelMain.insertBefore(interimEl, actionRow);
    } else if (panelMain) {
      panelMain.appendChild(interimEl);
    } else {
      document.getElementById('panel').appendChild(interimEl);
    }
  }
  return interimEl;
}
// FIX #12: Show interim text in input box (grayed/italic) before final arrives
let inputInterimEl = null;
function showInterimInInput(text) {
  if (!inputInterimEl) {
    inputInterimEl = document.createElement('span');
    inputInterimEl.className = 'input-interim';
    // FIX #2: Insert into composer (not input-area) for correct positioning
    composer.appendChild(inputInterimEl);
  }
  inputInterimEl.textContent = text;
  inputInterimEl.style.display = text ? 'block' : 'none';
}
function clearInputInterim() {
  if (inputInterimEl) {
    inputInterimEl.textContent = '';
    inputInterimEl.style.display = 'none';
  }
}
let statusTimer = null;
function showStatus(message, button) {
  let el = document.getElementById('onscreenly-status');
  if (!el) {
    el = document.createElement('div');
    el.id = 'onscreenly-status';
    // Insert into panel-main before the action row
    const panelMain = document.getElementById('panel-main');
    const actionRow = document.getElementById('action-row');
    if (panelMain && actionRow && actionRow.parentNode === panelMain) {
      panelMain.insertBefore(el, actionRow);
    } else if (panelMain) {
      panelMain.appendChild(el);
    } else {
      document.getElementById('panel').appendChild(el);
    }
  }
  el.textContent = message;
  if (button) el.appendChild(button);
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
      // FIX #2: Clear interim element when capture stops
      if (interimEl) {
        interimEl.textContent = '';
        interimEl.classList.remove('show');
      }
      // Don't auto-close sidebar — let user keep it open if they want
    }
    if (active && mode === 'local') setSttState('local');
    else updateSttStatus({ active, streaming });
  });

  onscreenly.on('stt:interim', ({ channel, text }) => {
    setLiveDotState('transcribing');
    const el = getOrCreateInterimEl();
    const label = channel === 'them' ? 'Them' : 'You';
    el.textContent = `${label}: ${text}`;
    el.classList.add('show');
    appendTranscriptHistoryTurn(channel, text, true); // update sidebar interim

    // FIX #12: Show interviewer's interim speech in input area
    if (channel === 'them' && !input.value.trim()) {
      showInterimInInput(text);
    }
  });
  onscreenly.on('stt:final', ({ channel, text }) => {
    setLiveDotState('idle');
    // Clear interim when we get a final
    if (interimEl) {
      interimEl.textContent = '';
      interimEl.classList.remove('show');
    }
    clearTranscriptInterim();
    clearInputInterim(); // FIX #12: Clear interim text from input area
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
      if (status === 'loading' || status === 'transcribing' || status === 'stopping') setLiveDotState('transcribing');
      if (status === 'ready') setLiveDotState('idle');
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
  onscreenly.on('llm:start', ({ userBubble, small, category }) => {
    state.responseCount++;
    if (state.responseCount > MAX_RESPONSES) {
      const oldest = messages.querySelector('.response-group');
      if (oldest) oldest.remove();
      state.responseCount = MAX_RESPONSES;
    }
    const group = document.createElement('div');
    group.className = 'response-group';
    const sep = document.createElement('div');
    sep.className = 'response-sep';
    sep.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    group.appendChild(sep);
    if (userBubble) {
      const b = document.createElement('div');
      b.className = 'user-bubble';
      b.textContent = userBubble;
      group.appendChild(b);
    }
    if (category) {
      const pill = document.createElement('div');
      pill.className = 'category-pill';
      pill.textContent = category.charAt(0).toUpperCase() + category.slice(1);
      group.appendChild(pill);
    }
    state.aiEl = document.createElement('div');
    state.aiEl.className = 'ai-text' + (small ? ' small' : '');
    state.aiEl.dataset.raw = '';
    state.caretEl = document.createElement('span');
    state.caretEl.className = 'ai-caret';
    state.aiEl.appendChild(state.caretEl);
    group.appendChild(state.aiEl);
    messages.appendChild(group);
    // Use requestAnimationFrame so the DOM is fully updated before scrolling.
    // Scroll #messages directly rather than calling sep.scrollIntoView(): that
    // scrolls *every* scrollable ancestor, and once the panel is tall enough it
    // scrolls the document too, aligning the separator to the top of the window
    // and pushing #toolbar out of view. html/body are overflow:hidden, so there
    // is no scrollbar or wheel gesture to undo it — the Stop/Hide/Quit controls
    // just never come back.
    requestAnimationFrame(() => {
      if (sep && sep.isConnected) {
        messages.scrollTo({ top: sep.offsetTop - messages.offsetTop, behavior: 'smooth' });
      }
    });
    setBusy(true);
  });
  onscreenly.on('llm:token', ({ text }) => appendToken(text));
  onscreenly.on('llm:done', () => {
    finalizeAi();
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

export { clearInputInterim, interimEl, showStatus };
