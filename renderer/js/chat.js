// The answer panel: markdown rendering, streaming answers, busy state, transcript interim, toasts and mode buttons.
import { state } from './state.js';
import { $, onscreenly } from './core.js';

// ---- state -------------------------------------------------------------

// Redacted view of the publik API state (never the key), from main via
// onscreenly.publikState() at boot and the publik:state push thereafter.

let busy = false;
const MAX_RESPONSES = 20;

const messages = $('#messages');

function esc(s) {
  return String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

// minimal, safe markdown: fenced code, bullets, inline code, bold, paragraphs
function renderMarkdown(text) {
  const lines = text.split('\n');
  let html = '',
    inCode = false,
    inList = false,
    buf = [];
  const flushP = () => {
    if (buf.length) {
      html += '<p>' + inline(buf.join(' ')) + '</p>';
      buf = [];
    }
  };
  const inline = (s) =>
    esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  for (const raw of lines) {
    const line = raw;
    if (/^```/.test(line.trim())) {
      if (!inCode) {
        flushP();
        if (inList) {
          html += '</ul>';
          inList = false;
        }
        html += '<pre><code>';
        inCode = true;
      } else {
        html += '</code></pre>';
        inCode = false;
      }
      continue;
    }
    if (inCode) {
      html += esc(line) + '\n';
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      flushP();
      if (!inList) {
        html += '<ul>';
        inList = true;
      }
      html += '<li>' + inline(line.replace(/^\s*[-*]\s+/, '')) + '</li>';
      continue;
    }
    if (line.trim() === '') {
      flushP();
      if (inList) {
        html += '</ul>';
        inList = false;
      }
      continue;
    }
    buf.push(line.trim());
  }
  flushP();
  if (inList) html += '</ul>';
  if (inCode) html += '</code></pre>';
  return html;
}

function clearMessages() {
  messages.innerHTML = '';
  state.aiEl = null;
  state.caretEl = null;
}

function addUserBubble(text) {
  const b = document.createElement('div');
  b.className = 'user-bubble';
  b.textContent = text;
  messages.appendChild(b);
}

function startAi(small) {
  state.aiEl = document.createElement('div');
  state.aiEl.className = 'ai-text' + (small ? ' small' : '');
  state.aiEl.dataset.raw = '';
  state.caretEl = document.createElement('span');
  state.caretEl.className = 'ai-caret';
  state.aiEl.appendChild(state.caretEl);
  messages.appendChild(state.aiEl);
}

function appendToken(t) {
  if (!state.aiEl) startAi(false);
  state.aiEl.dataset.raw += t;
  const span = document.createElement('span');
  span.className = 'w';
  span.textContent = t;
  // Guard: caretEl must be a child of aiEl
  if (state.caretEl && state.caretEl.parentNode === state.aiEl) {
    state.aiEl.insertBefore(span, state.caretEl);
  } else {
    state.aiEl.appendChild(span);
  }
}

function finalizeAi() {
  if (!state.aiEl) return;
  const raw = state.aiEl.dataset.raw || '';
  state.aiEl.innerHTML = renderMarkdown(raw);
  state.aiEl = null;
  state.caretEl = null;
}

let busyFailsafe = null;
function setBusy(v) {
  busy = v;
  $('#send-btn').classList.toggle('busy', v);
  clearTimeout(busyFailsafe);
  // Failsafe: main has a 25s stream watchdog that always sends llm:done/llm:error, but if a
  // terminal event is ever lost the whole UI stays frozen — self-clear after a generous window.
  if (v)
    busyFailsafe = setTimeout(() => {
      busy = false;
      $('#send-btn').classList.toggle('busy', false);
    }, 40000);
}

// ---- transcript helpers ------------------------------------------------
// NOTE: The old transcript-list element was renamed to ts-list.
// These helpers are now deprecated but kept for compatibility.
// The main sidebar uses appendTranscriptHistoryTurn() instead.

// FIX #1: Updated to use ts-list instead of non-existent transcript-list

function clearTranscriptInterim() {
  if (state.transcriptInterimEl) {
    state.transcriptInterimEl.remove();
    state.transcriptInterimEl = null;
  }
}

// ---- toast helper ------------------------------------------------------
// FIX #7: Toast queue system — ensures latest toast wins cleanly without stacking
let toastTimer = null;
let toastFadeTimer = null;
function showToast(message, ms) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.getElementById('panel-wrap').appendChild(el);
  }
  // Clear any pending timers to prevent overlap
  clearTimeout(toastTimer);
  clearTimeout(toastFadeTimer);
  // Immediately update content (no stacking)
  el.textContent = message;
  el.classList.add('show');
  toastTimer = setTimeout(() => {
    el.classList.remove('show');
  }, ms);
}

// ---- actions -----------------------------------------------------------
function runMode(mode, text) {
  if (busy) return;
  setBusy(true);
  onscreenly.ask({ mode, text: text || '' });
}

export function init() {
  document.querySelectorAll('.act').forEach((btn) => {
    btn.addEventListener('click', () => runMode(btn.dataset.mode, ''));
  });
}

export {
  MAX_RESPONSES,
  addUserBubble,
  appendToken,
  clearMessages,
  clearTranscriptInterim,
  esc,
  finalizeAi,
  messages,
  runMode,
  setBusy,
  showToast,
  startAi
};
