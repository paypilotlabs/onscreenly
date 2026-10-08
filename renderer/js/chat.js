// The answer panel: answer groups, markdown rendering, streaming answers, busy state, toasts and mode buttons.
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

function createEl(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

// ---- scrolling -----------------------------------------------------------
// The log follows the newest answer until its question reaches the top, then stops, so a long
// answer is read from its start. Scrolling by hand takes over until the next answer. A finished
// answer that only just overflows shows its end, so its card actions or sources stay in view.
let following = true;

// Where a group's question line starts (below the hairline that separates it from the previous one).
function groupTop(group) {
  const pad = group.previousElementSibling ? parseFloat(getComputedStyle(group).paddingTop) || 0 : 0;
  return group.offsetTop - messages.offsetTop + pad;
}

function followNewest() {
  const group = messages.lastElementChild;
  if (following && group) {
    const max = messages.scrollHeight - messages.clientHeight;
    const top = groupTop(group);
    const showEnd = group.dataset.state === 'done' && max - top <= 48;
    messages.scrollTop = Math.max(0, showEnd ? max : Math.min(top, max));
  }
  updateFades(messages);
}

// A scrolled list fades out at the edge that cuts through content (not at the top of the log when
// an answer starts exactly there).
function updateFades(list) {
  const max = list.scrollHeight - list.clientHeight;
  const top = list.scrollTop;
  let fadeTop = top > 1;
  if (fadeTop && list === messages) {
    fadeTop = ![...messages.querySelectorAll('.response-group')].some((g) => Math.abs(groupTop(g) - top) < 2);
  }
  list.classList.toggle('fade-top', fadeTop);
  list.classList.toggle('fade-bottom', max - top > 2);
}

// One answer: a meta row (the question as a quiet line, its category and the time), then the
// answer itself, streaming behind a caret. Older answers step back once a newer one arrives.
function startResponseGroup({ question, category, small, cards } = {}) {
  messages.querySelectorAll('.response-group').forEach((g) => g.classList.add('older'));
  const now = new Date();
  const time = createEl('time', 'response-sep', now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  time.dateTime = now.toISOString();
  const meta = createEl('div', 'rg-meta');
  meta.append(
    createEl('div', 'user-bubble', question),
    createEl('span', 'category-pill', category ? category.charAt(0).toUpperCase() + category.slice(1) : ''),
    time
  );
  state.aiEl = createEl('div', 'ai-text' + (small ? ' small' : '') + (cards ? ' cards' : ''));
  state.aiEl.dataset.raw = '';
  state.caretEl = createEl('span', 'ai-caret');
  state.caretEl.setAttribute('aria-hidden', 'true');
  state.aiEl.appendChild(state.caretEl);
  const group = createEl('div', 'response-group');
  group.dataset.state = 'streaming';
  group.append(meta, state.aiEl);
  messages.appendChild(group);
  following = true;
  followNewest();
  return group;
}

// An answer with no llm:start before it (an early error) still gets its own group.
function startAi(small) {
  startResponseGroup({ small });
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
  followNewest();
}

function finalizeAi() {
  const el = state.aiEl;
  if (!el) return null;
  el.innerHTML = renderMarkdown(el.dataset.raw || '');
  if (el.classList.contains('cards')) groupIntoCards(el);
  state.aiEl = null;
  state.caretEl = null;
  const group = el.closest('.response-group');
  if (group) group.dataset.state = 'done';
  followNewest();
  return el;
}

// Under a finished answer: Copy / Save as Markdown… for a structured answer, and the vault notes
// it drew on. Clicking a note opens it in Obsidian.
function addAnswerExtras(answer, sources) {
  const raw = answer.dataset.raw || '';
  let anchor = answer;
  if (answer.classList.contains('cards') && raw.trim()) {
    const actions = createEl('div', 'ai-actions');
    const copy = createEl('button', 'btn btn-secondary compact ai-action', 'Copy');
    copy.type = 'button';
    copy.dataset.act = 'copy';
    copy.addEventListener('click', () => {
      onscreenly
        .copyAnswer(raw)
        .then(() => showToast('Copied', 1600, 'ok'))
        .catch(() => showToast('Couldn’t copy', 2000));
    });
    const save = createEl('button', 'btn btn-secondary compact ai-action', 'Save as Markdown…');
    save.type = 'button';
    save.dataset.act = 'save';
    save.addEventListener('click', () => {
      onscreenly
        .saveAnswerMarkdown(raw, 'resume-analysis')
        .then((result) => result && result.saved && showToast('Saved ' + result.fileName, 2200, 'ok'))
        .catch(() => showToast('Couldn’t save the file', 2200));
    });
    actions.append(copy, save);
    anchor.after(actions);
    anchor = actions;
  }
  if (Array.isArray(sources) && sources.length) {
    const row = createEl('div', 'ai-sources');
    row.append(createEl('span', 'ai-sources-label', 'From your notes'));
    for (const source of sources) {
      const link = createEl('button', 'tag ai-source');
      link.type = 'button';
      link.title = 'Open in Obsidian: ' + source.relPath;
      link.append(createEl('span', 'ai-source-title', source.title));
      link.addEventListener('click', () => onscreenly.knowledgeOpenNote(source.relPath).catch(() => {}));
      row.append(link);
    }
    anchor.after(row);
  }
  followNewest();
}

let busyFailsafe = null;
function armBusyFailsafe() {
  clearTimeout(busyFailsafe);
  busyFailsafe = setTimeout(() => setBusy(false), 40000);
}
function setBusy(v) {
  busy = v;
  $('#send-btn').classList.toggle('busy', v);
  messages.setAttribute('aria-busy', String(v));
  // The mode buttons step back while an answer is on its way (runMode ignores them meanwhile).
  document.querySelectorAll('.act').forEach((btn) => {
    if (v) btn.setAttribute('aria-disabled', 'true');
    else btn.removeAttribute('aria-disabled');
  });
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
// One toast at a time, centred under the toolbar; the latest replaces the last. While it shows, the
// panel moves down by its height (overlay.css), so it never covers an answer. `tone` 'ok' adds a dot.
let toastTimer = null;
function showToast(message, ms, tone) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-atomic', 'true');
    document.getElementById('toolbar').appendChild(toast);
  }
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.title = message;
  if (tone) toast.dataset.tone = tone;
  else delete toast.dataset.tone;
  // Restart the fade-in when one toast replaces another.
  toast.classList.remove('show');
  void toast.offsetWidth;
  toast.classList.add('show');
  toastTimer = setTimeout(() => toast.classList.remove('show'), ms);
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
  messages.addEventListener('scroll', () => updateFades(messages), { passive: true });
  messages.addEventListener('wheel', () => (following = false), { passive: true });
  // A rising answer overflows the log for a moment; check the fades again once it settles.
  messages.addEventListener('animationend', () => updateFades(messages));
  // The log shrinks when a banner or toast appears beside it: keep the same part of the answer in view.
  new ResizeObserver(() => followNewest()).observe(messages);
}

export {
  MAX_RESPONSES,
  addAnswerExtras,
  appendToken,
  clearTranscriptInterim,
  esc,
  finalizeAi,
  messages,
  noteStreamActivity,
  runMode,
  setBusy,
  showToast,
  startAi,
  startResponseGroup,
  updateFades
};
