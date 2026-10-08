// Toolbar controls: collapse/expand, opacity, start/end session and clearing the transcript.
import { state } from './state.js';
import { $, combo, onscreenly, setSessionButton } from './core.js';
import { showToast } from './chat.js';
import { hardClearSTTFill, inputFromSTT } from './composer.js';
import { startSystemAudio, stopSystemAudio } from './audio.js';
import {
  clearTranscriptSidebar,
  fitActionRow,
  hideSidebar,
  setClearConfirm,
  setSttState,
  showSidebar,
  sidebarOpen
} from './transcript.js';

// Hide / Show: the panel collapses; the toolbar (with the live dot) and any toast stay.
let reopenSidebarOnExpand = false;
function toggleHide() {
  const collapsed = $('#panel-wrap').classList.toggle('collapsed');
  const btn = $('#hide-btn');
  const text = collapsed ? 'Show' : 'Hide';
  btn.classList.toggle('collapsed', collapsed);
  btn.querySelector('.tb-hide-label').textContent = text;
  btn.title = `${text} (${combo('mod', 'shift', '/')})`;
  btn.setAttribute('aria-label', text);
  btn.setAttribute('aria-expanded', String(!collapsed));
  if (collapsed) {
    reopenSidebarOnExpand = sidebarOpen;
    if (sidebarOpen) hideSidebar();
  } else {
    btn.classList.remove('has-unread');
    fitActionRow();
    if (reopenSidebarOnExpand) showSidebar();
  }
}

// While the panel is hidden, a new answer puts a dot on Show; showing the panel clears it.
function markUnread() {
  if ($('#panel-wrap').classList.contains('collapsed')) $('#hide-btn').classList.add('has-unread');
}

// ---- session -------------------------------------------------------------
// Start or end a session: the button and ⌘⇧L (session:toggle from main) both come here. Meeting
// audio is opened first, while a click's user gesture is fresh (getDisplayMedia needs one), and the
// button shows "Starting…" until main's capture:state says the session is up.
async function toggleSession() {
  const btn = $('#stop-btn');
  if (btn.classList.contains('is-pending')) return;
  const turningOn = !btn.classList.contains('active');
  if (turningOn) {
    setSessionButton(false, true);
    setSttState('connecting');
    // startSystemAudio may fail (user cancels, no permission) — that's OK,
    // mic will still work and capture will toggle regardless
    try {
      await startSystemAudio();
    } catch (_) {
      /* handled inside startSystemAudio */
    }
  }
  const active = await onscreenly.captureToggle();
  if (!turningOn) return;
  if (!active) stopSystemAudio();
  // Normally capture:state has already ended "Starting…"; when the start failed, nothing did.
  if (btn.classList.contains('is-pending')) {
    setSessionButton(active);
    if (!active) setSttState('disconnected');
  }
}

const OPACITY_MIN = 0.2;
function clampOpacity(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.min(1, Math.max(OPACITY_MIN, Math.round(n * 100) / 100));
}
function opacityToPercent(value) {
  return Math.round(clampOpacity(value) * 100);
}
function persistOpacitySoon() {
  clearTimeout(persistOpacitySoon.timer);
  persistOpacitySoon.timer = setTimeout(() => {
    if (!state.settings) return;
    onscreenly
      .settingsSet({ opacity: state.settings.opacity })
      .then((next) => {
        if (next) state.settings = next;
      })
      .catch(() => {});
  }, 400);
}
function applyOpacity(value, persist) {
  const opacity = clampOpacity(value);
  const percent = opacityToPercent(opacity);
  if (state.settings) state.settings.opacity = opacity;
  document.documentElement.style.setProperty('--onscreenly-opacity', String(opacity));
  const tb = $('#tb-opacity-slider');
  const tbVal = $('#tb-opacity-value');
  const s = $('#s-opacity-slider');
  const sVal = $('#s-opacity-value');
  // The filled part of each slider's track, from the 20% floor to 100%.
  const floor = OPACITY_MIN * 100;
  const fill = ((percent - floor) / (100 - floor)) * 100 + '%';
  if (tb) {
    tb.value = String(percent);
    tb.setAttribute('aria-valuetext', percent + '%');
    tb.style.setProperty('--pct', fill);
  }
  if (tbVal) tbVal.textContent = percent + '%';
  if (s) {
    s.value = String(percent);
    s.setAttribute('aria-valuetext', percent + '%');
    s.style.setProperty('--fill', fill);
  }
  if (sVal) sVal.textContent = percent + '%';
  if (persist) persistOpacitySoon();
}
function toggleOpacityPopover(force) {
  const pop = $('#opacity-popover');
  const btn = $('#opacity-btn');
  if (!pop || !btn) return;
  const open = force != null ? force : pop.classList.contains('hidden');
  pop.classList.toggle('hidden', !open);
  btn.classList.toggle('on', open);
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  document.getElementById('app').classList.toggle('opacity-open', open);
}

// Transcript toggle removed — sidebar now auto-opens with listening

// Clear transcript
const clearTranscriptBtn = document.getElementById('clear-transcript-btn');

export function init() {
  $('#hide-btn').addEventListener('click', toggleHide);
  onscreenly.on('hide:toggle', toggleHide);
  $('#opacity-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleOpacityPopover();
  });
  document.addEventListener('click', (e) => {
    const wrap = document.querySelector('.tb-opacity-wrap');
    if (wrap && !wrap.contains(e.target)) toggleOpacityPopover(false);
  });
  ['tb-opacity-slider', 's-opacity-slider'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => applyOpacity(Number(el.value) / 100, true));
    el.addEventListener('change', () => applyOpacity(Number(el.value) / 100, true));
  });

  $('#stop-btn').addEventListener('click', toggleSession);
  onscreenly.on('session:toggle', toggleSession);
  if (clearTranscriptBtn) {
    clearTranscriptBtn.addEventListener('click', async () => {
      if (!clearTranscriptBtn.classList.contains('confirm')) {
        setClearConfirm(true);
        return;
      }
      setClearConfirm(false);
      await onscreenly.clearTranscript();
      state.transcriptInterimEl = null;
      clearTranscriptSidebar();
      // Only a question auto-filled from the transcript goes; anything the user typed stays.
      if (inputFromSTT) hardClearSTTFill();
      showToast('Transcript cleared', 2500, 'ok');
    });
  }
}

export { applyOpacity, clampOpacity, markUnread };
