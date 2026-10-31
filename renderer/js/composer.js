// The question box: smart auto-fill from speech, question history, sending and keyboard shortcuts.
import { state } from './state.js';
import { $, combo, onscreenly, shortcutKeys } from './core.js';
import { isBusy, runMode, showToast } from './chat.js';

const input = $('#input');
const placeholder = $('#placeholder');
const composer = $('#composer');
const ghost = $('.input-ghost');

// ========== SMART AUTO-FILL SYSTEM ==========
// Track whether the current input text came from STT auto-fill (Them channel)
let inputFromSTT = false;
let sttFillTimer = null;
let questionFinalizeTimer = null;
let softClearTimer = null;
let userSpeechStart = null;

// Question history for undo (Ctrl+Z)
const questionHistory = [];
const MAX_QUESTION_HISTORY = 10;

// ---- Question completeness detection ----
function isLikelyCompleteQuestion(text) {
  const trimmed = (text || '').trim();

  // Must be substantial (not just filler words)
  if (trimmed.length < 12) return false;

  // High confidence: ends with question mark
  if (/\?$/.test(trimmed)) return true;

  // High confidence: behavioral interview patterns (these are complete even without ?)
  const behavioralPatterns = [
    /tell me about a time/i,
    /give me an example/i,
    /describe a (situation|time|project|challenge)/i,
    /walk me through/i,
    /can you (tell|describe|explain|share)/i,
    /what (was|were|is|are) your/i,
    /how (did|do|would) you/i,
    /why (did|do|are|should)/i,
    /what (did|do|would) you/i,
    /tell me about yourself/i,
    /tell me about your/i,
    /what.{1,30}(biggest|greatest|most|hardest|proudest)/i,
    /have you ever/i
  ];
  if (behavioralPatterns.some((p) => p.test(trimmed))) return true;

  // Medium confidence: question starters with substantial content
  const questionStarters =
    /^(what|how|why|when|where|who|which|tell|describe|explain|can|could|would|should|have|did|do|is|are|was|were)/i;
  if (questionStarters.test(trimmed) && trimmed.length > 25) return true;

  // Medium confidence: ends with common question endings
  if (
    /(about that|for us|to us|with you|for you|about it|to share|you handle|you approach|your experience|your background)\s*$/i.test(
      trimmed
    )
  )
    return true;

  return false;
}

// ---- Get question confidence level ----
function getQuestionConfidence(text) {
  const trimmed = (text || '').trim();
  if (trimmed.length < 8) return 'low';
  if (/\?$/.test(trimmed)) return 'high';
  if (isLikelyCompleteQuestion(trimmed)) return 'medium';
  if (trimmed.length > 20) return 'accumulating';
  return 'low';
}

// ---- Update visual state based on question readiness ----
// FIX #8: Batch class updates to avoid flicker
function updateQuestionReadyState() {
  const text = input.value;
  const confidence = getQuestionConfidence(text);

  // Batch the class changes to minimize repaints
  const shouldBeReady = confidence === 'high' || confidence === 'medium';
  const shouldBeAccumulating = confidence === 'accumulating';

  // Only update if state actually changed
  const isReady = composer.classList.contains('stt-ready');
  const isAccumulating = composer.classList.contains('stt-accumulating');

  if (shouldBeReady !== isReady || shouldBeAccumulating !== isAccumulating) {
    composer.classList.remove('stt-ready', 'stt-accumulating');
    if (shouldBeReady) {
      composer.classList.add('stt-ready');
    } else if (shouldBeAccumulating) {
      composer.classList.add('stt-accumulating');
    }
  }

  updateSendButtonState(); // FIX #9: Keep send button in sync
}

// FIX #9: Send button visual "ready" state. Send always reads "Send"; its title says what it does
// now: with text it sends it, empty it runs Assist on the screen.
function updateSendButtonState() {
  const sendBtn = document.getElementById('send-btn');
  if (!sendBtn) return;

  const hasText = input.value.trim().length > 0;
  const isReady = composer.classList.contains('stt-ready');

  sendBtn.classList.toggle('ready', hasText && isReady);
  sendBtn.classList.toggle('has-text', hasText);
  sendBtn.title = hasText
    ? `Send (${combo('↵')})`
    : `Assist · looks at your screen (${combo(...shortcutKeys('assist'))})`;
}

// ---- Live speech as ghost text ----
// The other side's words show once, as one line of ghost text in the empty composer, until they
// settle into the question (stt:final) or the user types. The newest words stay in view.
function showGhost(text) {
  if (!text || input.value.length) {
    clearGhost();
    return;
  }
  let words = ghost.querySelector('.ghost-text > span');
  if (!words) {
    const line = document.createElement('span');
    line.className = 'ghost-text';
    words = document.createElement('span');
    line.append(words);
    ghost.replaceChildren(line);
  }
  words.textContent = text;
  ghost.classList.remove('hidden');
  syncPlaceholder();
}

function clearGhost() {
  if (ghost.classList.contains('hidden')) return;
  ghost.classList.add('hidden');
  ghost.replaceChildren();
  syncPlaceholder();
}

// ---- Save question to history for undo ----
function saveToQuestionHistory(text) {
  if (!text || text.trim().length < 5) return;

  // Don't save duplicates
  const last = questionHistory[questionHistory.length - 1];
  if (last && last.text === text.trim()) return;

  questionHistory.push({
    text: text.trim(),
    timestamp: Date.now()
  });

  // Keep only recent history
  while (questionHistory.length > MAX_QUESTION_HISTORY) {
    questionHistory.shift();
  }
}

// ---- Restore last question from history (Ctrl+Z) ----
function restoreLastQuestion() {
  const last = questionHistory.pop();
  if (last) {
    input.value = last.text;
    inputFromSTT = true;
    lastSTTValue = last.text; // FIX #8: Track restored value for edit detection
    composer.classList.add('stt-filling');
    updateQuestionReadyState();
    syncPlaceholder();
    showToast('Question restored', 1500, 'ok');
    return true;
  }
  showToast('Nothing to restore', 1500);
  return false;
}

// ---- Auto-fill the input box with transcribed speech from interviewer ----
function autoFillInputFromSTT(text) {
  // If user has manually typed something different, don't overwrite
  if (!inputFromSTT && input.value.trim().length > 0) return;

  // Cancel any pending soft-clear (interviewer is still talking)
  clearTimeout(softClearTimer);
  composer.classList.remove('stt-dimmed');

  const current = input.value.trim();
  const newText = current ? current + ' ' + text : text;
  input.value = newText;
  inputFromSTT = true;
  lastSTTValue = newText; // FIX #6: Track the STT value for edit detection
  syncPlaceholder();

  // Show filling state
  composer.classList.add('stt-filling');
  updateQuestionReadyState();
  updateSendButtonState(); // FIX #9: Update send button state

  // Reset the idle timer — after 2s of silence, check if question is complete
  clearTimeout(questionFinalizeTimer);
  questionFinalizeTimer = setTimeout(() => {
    // A question that looks complete is ready: the composer says "Ready · ↵ to answer".
    if (isLikelyCompleteQuestion(input.value)) {
      composer.classList.add('stt-ready');
      updateSendButtonState(); // FIX #9: Update send button when ready
    }
  }, 1800);

  // After 8s of no new words, save to history and keep stable
  clearTimeout(sttFillTimer);
  sttFillTimer = setTimeout(() => {
    saveToQuestionHistory(input.value);
    composer.classList.remove('stt-filling');
    // Keep stt-ready if applicable
    updateQuestionReadyState();
    updateSendButtonState(); // FIX #9
  }, 8000);
}

// ---- Soft clear: don't immediately wipe question when user speaks ----
function softClearSTTFill() {
  // When the user speaks (You channel), don't immediately clear
  // Instead, dim the input and wait — they might just be acknowledging
  if (!inputFromSTT) return;

  // FIX #3: Reset userSpeechStart at the beginning before setting new timestamp
  // This ensures we always track from fresh when a new soft-clear cycle begins
  const now = Date.now();
  if (!userSpeechStart) {
    userSpeechStart = now;
  }

  // Dim the input to show it's in "pending clear" state
  composer.classList.add('stt-dimmed');

  // Clear the finalization timer (user is responding)
  clearTimeout(questionFinalizeTimer);

  // Re-armed on every 'you' final, so this fires ~800ms after the user stops.
  // The 2s test below is measured from the FIRST final of this cycle, so a brief
  // acknowledgement ("mm-hm") leaves the question on screen while a sustained
  // answer clears it. Firing at 2.5s instead would make that test always true.
  clearTimeout(softClearTimer);
  softClearTimer = setTimeout(() => {
    const speechDuration = userSpeechStart ? Date.now() - userSpeechStart : 0;
    if (speechDuration > 2000) {
      // User has been speaking for a while — they're answering, clear the box
      saveToQuestionHistory(input.value);
      input.value = '';
      inputFromSTT = false;
      composer.classList.remove('stt-filling', 'stt-dimmed', 'stt-ready', 'stt-accumulating');
      syncPlaceholder();
      updateSendButtonState(); // FIX #9: Update send button state
      userSpeechStart = null;
    }
  }, 800);
}

// ---- Hard clear (called when user explicitly clears or types) ----
// FIX #10: Add option to show toast when clearing
function hardClearSTTFill(showUndoHint = false) {
  const hadContent = input.value.trim().length > 0;
  saveToQuestionHistory(input.value);
  input.value = '';
  inputFromSTT = false;
  lastSTTValue = ''; // FIX #6: Clear the tracked STT value
  userSpeechStart = null;
  composer.classList.remove('stt-filling', 'stt-dimmed', 'stt-ready', 'stt-accumulating');
  clearTimeout(softClearTimer);
  clearTimeout(questionFinalizeTimer);
  clearTimeout(sttFillTimer);
  clearGhost(); // FIX #5: Clear live speech when clearing input
  syncPlaceholder();
  updateSendButtonState(); // FIX #9

  // FIX #10: Show undo hint when explicitly cleared
  if (showUndoHint && hadContent) {
    showToast(`Cleared · ${combo('mod', 'Z')} to undo`, 2000);
  }
}

// ---- Reset soft-clear state (interviewer spoke again) ----
// FIX #16: Reset userSpeechStart properly when cancelSoftClear is called
function cancelSoftClear() {
  userSpeechStart = null; // Reset timestamp so next soft-clear starts fresh
  clearTimeout(softClearTimer);
  composer.classList.remove('stt-dimmed');
}

function syncPlaceholder() {
  placeholder.classList.toggle(
    'hidden',
    input.value.length > 0 || document.activeElement === input || !ghost.classList.contains('hidden')
  );
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 100) + 'px';
}

// FIX #6: Track last STT value to detect substantial edits vs minor corrections
let lastSTTValue = '';

function send() {
  const text = input.value.trim();
  // While an answer is on its way runMode ignores a new one, so the question stays in the box
  // instead of being cleared and lost.
  if (isBusy()) {
    if (text) showToast('Still answering · send again when it’s done', 2000);
    return;
  }
  if (!text) {
    runMode('assist', '');
    return;
  }
  const wasFromSTT = inputFromSTT;

  // Save to history before clearing (in case user wants to redo)
  saveToQuestionHistory(text);

  input.value = '';
  inputFromSTT = false;
  lastSTTValue = ''; // FIX #6: Clear tracked STT value
  userSpeechStart = null;
  composer.classList.remove('stt-filling', 'stt-dimmed', 'stt-ready', 'stt-accumulating');
  clearTimeout(softClearTimer);
  clearTimeout(questionFinalizeTimer);
  clearTimeout(sttFillTimer);
  syncPlaceholder();
  updateSendButtonState(); // FIX #9

  // If text came from STT (interviewer question), use answerThis mode
  // Otherwise use ask mode (user typed their own question)
  runMode(wasFromSTT ? 'answerThis' : 'ask', text);
}

// Smart toggle
const smartBtn = $('#smart-toggle');

export function init() {
  input.addEventListener('input', () => {
    const currentValue = input.value;

    // FIX #5: Clear live speech when user starts typing
    clearGhost();

    // FIX #6: Only detach from STT mode if edit is substantial
    // Minor corrections (typo fixes, small additions) should keep STT mode
    if (inputFromSTT && lastSTTValue) {
      const lengthDiff = Math.abs(currentValue.length - lastSTTValue.length);
      const isCleared = currentValue.trim().length === 0;
      const isSubstantialChange = lengthDiff > lastSTTValue.length * 0.3 || isCleared;

      if (isSubstantialChange) {
        // User made a major change — detach from STT mode
        saveToQuestionHistory(lastSTTValue);
        inputFromSTT = false;
        lastSTTValue = '';
        composer.classList.remove('stt-filling', 'stt-dimmed', 'stt-ready', 'stt-accumulating');
        clearTimeout(softClearTimer);
        clearTimeout(questionFinalizeTimer);
      }
      // Minor edits: keep inputFromSTT = true, just update visual state
    } else if (!inputFromSTT) {
      // User typing from scratch — standard behavior
      composer.classList.remove('stt-filling', 'stt-dimmed', 'stt-ready', 'stt-accumulating');
    }

    syncPlaceholder();
    updateSendButtonState(); // FIX #9: Update send button on input change
  });
  input.addEventListener('focus', () => {
    composer.classList.add('focused');
    placeholder.classList.add('hidden');
  });
  input.addEventListener('blur', () => {
    composer.classList.remove('focused');
    syncPlaceholder();
  });
  $('#input-area').addEventListener('click', () => input.focus());
  $('#send-btn').addEventListener('click', () => {
    if (isBusy()) onscreenly.cancelAnswer();
    else send();
  });
  input.addEventListener('keydown', (e) => {
    // Ctrl+Z / Cmd+Z: restore last question if input is empty
    if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !input.value.trim()) {
      e.preventDefault();
      restoreLastQuestion();
      return;
    }
    // Escape: clear the input (with undo hint)
    if (e.key === 'Escape' && input.value.trim()) {
      e.preventDefault();
      hardClearSTTFill(true); // FIX #10: Show undo hint
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      send();
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      runMode(e.shiftKey ? 'assist' : 'say', '');
    }
  });

  // FIX #13: Global keyboard shortcut for force-answer (Ctrl+Shift+A / Cmd+Shift+A)
  document.addEventListener('keydown', (e) => {
    // Ctrl+Shift+A / Cmd+Shift+A: Force answer current question immediately
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      if (input.value.trim()) {
        send();
      } else if (inputFromSTT || composer.classList.contains('stt-filling')) {
        // Even if question seems incomplete, force send
        send();
      } else {
        showToast('No question to answer', 1500);
      }
    }
  });
  smartBtn.addEventListener('click', async () => {
    state.settings.smart = !state.settings.smart;
    smartBtn.classList.toggle('on', state.settings.smart);
    smartBtn.setAttribute('aria-pressed', String(state.settings.smart));
    await onscreenly.settingsSet({ smart: state.settings.smart });
  });
}

export {
  autoFillInputFromSTT,
  cancelSoftClear,
  clearGhost,
  composer,
  hardClearSTTFill,
  input,
  inputFromSTT,
  placeholder,
  showGhost,
  smartBtn,
  softClearSTTFill,
  syncPlaceholder,
  updateSendButtonState
};
