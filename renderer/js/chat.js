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

// "## Heading" → "Heading". A single "#" stays text ("# of users is n"), and a
// closing run of #s only counts after a space, so "## C#" keeps its "#".
// No backtracking regex: a long line from a model must not freeze the window.
function headingText(line) {
  const open = /^ {0,3}#{2,6}[ \t]/.exec(line);
  if (!open) return '';
  let text = line.slice(open[0].length).trim();
  let end = text.length;
  while (end > 0 && text[end - 1] === '#') end--;
  if (end < text.length && (end === 0 || text[end - 1] === ' ' || text[end - 1] === '\t')) {
    text = text.slice(0, end).trimEnd();
  }
  return text;
}

// minimal, safe markdown: fenced code, headings, bullet and numbered lists,
// inline code, bold, paragraphs. Everything is escaped before tags are added.
function renderMarkdown(text) {
  const lines = text.split('\n');
  let html = '',
    inCode = false,
    list = null,
    buf = [];
  const flushP = () => {
    if (buf.length) {
      html += '<p>' + inline(buf.join(' ')) + '</p>';
      buf = [];
    }
  };
  const closeList = () => {
    if (list) {
      html += `</${list}>`;
      list = null;
    }
  };
  const openList = (tag) => {
    if (list === tag) return;
    closeList();
    html += `<${tag}>`;
    list = tag;
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
        closeList();
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
    const heading = headingText(line);
    if (heading) {
      flushP();
      closeList();
      html += '<h3>' + inline(heading) + '</h3>';
      continue;
    }
    if (/^\s*[-*•]\s+/.test(line)) {
      flushP();
      openList('ul');
      html += '<li>' + inline(line.replace(/^\s*[-*•]\s+/, '')) + '</li>';
      continue;
    }
    const numbered = /^\s*(\d{1,3})[.)]\s+/.exec(line);
    if (numbered) {
      flushP();
      openList('ol');
      // The item keeps its own number, so a list split by a blank line or a
      // code block does not restart at 1.
      html += `<li value="${Number(numbered[1])}">` + inline(line.slice(numbered[0].length)) + '</li>';
      continue;
    }
    if (line.trim() === '') {
      flushP();
      closeList();
      continue;
    }
    buf.push(line.trim());
  }
  flushP();
  closeList();
  if (inCode) html += '</code></pre>';
  return html;
}

// A structured answer (résumé analysis) shows each "## Section" as a card.
function groupIntoCards(el) {
  let card = null;
  for (const node of [...el.childNodes]) {
    if (node.nodeName === 'H3') {
      card = document.createElement('section');
      card.className = 'ai-card';
      el.insertBefore(card, node);
    }
    if (card) card.appendChild(node);
  }
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
  const el = state.aiEl;
  if (!el) return null;
  el.innerHTML = renderMarkdown(el.dataset.raw || '');
  if (el.classList.contains('cards')) groupIntoCards(el);
  state.aiEl = null;
  state.caretEl = null;
  return el;
}

// Under a finished answer: Copy / Save as Markdown for a structured answer,
// and the vault notes it drew on. Clicking a note opens it in Obsidian.
function addAnswerExtras(el, sources) {
  const raw = el.dataset.raw || '';
  let anchor = el;
  if (el.classList.contains('cards') && raw.trim()) {
    const actions = document.createElement('div');
    actions.className = 'ai-actions';
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'ai-action';
    copy.textContent = 'Copy';
    copy.addEventListener('click', () => {
      onscreenly
        .copyAnswer(raw)
        .then(() => showToast('Copied to the clipboard', 1600))
        .catch(() => showToast('Could not copy', 2000));
    });
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'ai-action';
    save.textContent = 'Save as Markdown…';
    save.addEventListener('click', () => {
      onscreenly
        .saveAnswerMarkdown(raw, 'resume-analysis')
        .then((result) => result && result.saved && showToast('Saved ' + result.fileName, 2200))
        .catch(() => showToast('Could not save the file', 2200));
    });
    actions.append(copy, save);
    anchor.after(actions);
    anchor = actions;
  }
  if (Array.isArray(sources) && sources.length) {
    const row = document.createElement('div');
    row.className = 'ai-sources';
    const label = document.createElement('span');
    label.textContent = 'From your notes';
    row.append(label);
    for (const source of sources) {
      const link = document.createElement('button');
      link.type = 'button';
      link.className = 'ai-source';
      link.textContent = source.title;
      link.title = 'Open in Obsidian: ' + source.relPath;
      link.addEventListener('click', () => onscreenly.knowledgeOpenNote(source.relPath).catch(() => {}));
      row.append(link);
    }
    anchor.after(row);
  }
}

let busyFailsafe = null;
function armBusyFailsafe() {
  clearTimeout(busyFailsafe);
  busyFailsafe = setTimeout(() => {
    busy = false;
    $('#send-btn').classList.toggle('busy', false);
  }, 40000);
}
function setBusy(v) {
  busy = v;
  $('#send-btn').classList.toggle('busy', v);
  clearTimeout(busyFailsafe);
  // Failsafe: main has a 25s stream watchdog that always sends llm:done/llm:error, but if a
  // terminal event is ever lost the whole UI stays frozen — self-clear after a generous window.
  if (v) armBusyFailsafe();
}
// Each streamed token restarts the failsafe window, so a long answer (a
// résumé analysis can run past 40 s) is never marked idle while it streams.
function noteStreamActivity() {
  if (busy) armBusyFailsafe();
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
  addAnswerExtras,
  addUserBubble,
  appendToken,
  clearMessages,
  clearTranscriptInterim,
  esc,
  finalizeAi,
  messages,
  noteStreamActivity,
  runMode,
  setBusy,
  showToast,
  startAi
};
