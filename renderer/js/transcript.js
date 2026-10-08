// Speech status (the live dot and the action row's status) and the transcript sidebar.
import { $ } from './core.js';
import { updateFades } from './chat.js';

// ---- live dot and speech status ------------------------------------------
let sttState = 'disconnected';

// The live dot inside "End session": 'off' | 'idle' (breathing) | 'speaking' (a ring) | 'error'
// (hollow: the session runs but nothing is being transcribed). Never red.
const DOT_TITLES = {
  off: 'Not listening',
  idle: 'Listening',
  speaking: 'Speech detected',
  error: 'Not transcribing'
};

function setLiveDotState(dotState) {
  const dot = document.getElementById('live-dot');
  if (!dot) return;
  // A transcription error holds until the session ends, whatever the voice detector says.
  const next = dotState !== 'off' && sttState === 'error' ? 'error' : dotState;
  dot.className = next;
  dot.title = DOT_TITLES[next] || '';
}

// Hidden while off; otherwise a 6px dot and a short label at the end of the action row.
const STT_LABELS = {
  disconnected: '',
  connecting: 'Starting…',
  loading: 'Starting…',
  streaming: 'Listening',
  batch: 'Listening',
  local: 'Listening',
  stopping: 'Stopping…',
  error: 'Transcription error'
};

function setSttState(state) {
  sttState = state;
  const status = document.getElementById('stt-status');
  if (!status) return;
  status.className = 'stt-status stt-' + state;
  status.querySelector('.stt-label').textContent = STT_LABELS[state];
  if (state === 'error') setLiveDotState('error');
  fitActionRow();
}

function updateSttStatus({ active, streaming } = {}) {
  if (active === false) setSttState('disconnected');
  else if (active === true) setSttState(streaming ? 'connecting' : 'batch');
}

// When the action row runs out of room (Windows key names beside a long status), the shortcut hints
// go first: Assist's, then Say's. The buttons' titles still name the shortcuts.
function fitActionRow() {
  const row = $('#action-row');
  row.classList.remove('drop-assist-hint', 'drop-hints');
  if (!row.clientWidth) return; // collapsed; checked again on expand
  for (const cls of ['drop-assist-hint', 'drop-hints']) {
    if (row.scrollWidth <= row.clientWidth) break;
    row.classList.add(cls);
  }
}

// ---- transcript sidebar (hidden by default, manual toggle) ----------------
const PLACEHOLDER = 'Nothing yet. Start a session and the conversation shows up here.';
let tsSidebarInterimEl = null;
let sidebarOpen = false;
// Track last committed row per channel — all chunks from same speaker go in one row
const tsLastRow = { you: null, them: null };
const tsRowTimer = { you: null, them: null };
const TS_SENTENCE_GAP_MS = 10000;

const SIDEBAR_GAP = 12;

function placeSidebar(sidebar) {
  const panel = $('#panel').getBoundingClientRect();
  const needed = sidebar.offsetWidth + SIDEBAR_GAP;
  const areaLeft = screen.availLeft;
  const areaRight = screen.availLeft + screen.availWidth;
  const fitsRight = window.screenX + panel.right + needed <= areaRight;
  const fitsLeft = window.screenX + panel.left - needed >= areaLeft;
  sidebar.classList.toggle('left', !fitsRight && fitsLeft);
}

function showSidebar() {
  const sidebar = document.getElementById('transcript-sidebar');
  placeSidebar(sidebar);
  sidebar.classList.add('open');
  historyBtn.classList.add('active');
  historyBtn.setAttribute('aria-expanded', 'true');
  sidebarOpen = true;
  requestAnimationFrame(syncTranscriptList);
}

function hideSidebar() {
  document.getElementById('transcript-sidebar').classList.remove('open');
  historyBtn.classList.remove('active');
  historyBtn.setAttribute('aria-expanded', 'false');
  sidebarOpen = false;
}

function toggleSidebar() {
  if (sidebarOpen) hideSidebar();
  else showSidebar();
}

// History button toggle
const historyBtn = document.getElementById('history-btn');

// Close sidebar button
const closeSidebarBtn = document.getElementById('close-sidebar-btn');

// One turn: THEM or YOU, the time it started, and what was said.
function turnRow(channel, text) {
  const row = document.createElement('div');
  row.className = 'ts-turn ts-' + channel;
  const label = document.createElement('span');
  label.className = 'ts-channel';
  label.textContent = channel === 'them' ? 'Them' : 'You';
  const now = new Date();
  const time = document.createElement('time');
  time.className = 'ts-time';
  time.dateTime = now.toISOString();
  time.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const words = document.createElement('span');
  words.className = 'ts-text';
  words.textContent = text;
  row.append(label, time, words);
  return row;
}

// Keep the newest line in view, fade the edge a scroll cuts through, and offer Clear only when
// there is something to clear.
function syncTranscriptList() {
  const list = document.getElementById('ts-list');
  list.scrollTop = list.scrollHeight;
  updateFades(list);
  $('#clear-transcript-btn').disabled = !list.querySelector('.ts-turn');
}

function appendTranscriptHistoryTurn(channel, text, isInterim) {
  const list = document.getElementById('ts-list');
  if (!list) return;

  // Remove placeholder on first real turn
  const ph = list.querySelector('.ts-placeholder');
  if (ph) ph.remove();

  if (isInterim) {
    // Update the single floating interim row
    if (!tsSidebarInterimEl) {
      tsSidebarInterimEl = turnRow(channel, '');
      tsSidebarInterimEl.classList.add('ts-interim-row');
      tsSidebarInterimEl.querySelector('.ts-text').classList.add('ts-interim');
      list.appendChild(tsSidebarInterimEl);
    }
    tsSidebarInterimEl.querySelector('.ts-text').textContent = text;
  } else {
    // Remove interim row
    if (tsSidebarInterimEl) {
      tsSidebarInterimEl.remove();
      tsSidebarInterimEl = null;
    }

    const existingRow = tsLastRow[channel];
    const useExisting = existingRow && existingRow.isConnected;

    if (useExisting) {
      // Append to existing row — accumulates sentence fragments
      const txt = existingRow.querySelector('.ts-text');
      txt.textContent = txt.textContent ? txt.textContent + ' ' + text : text;
    } else {
      tsLastRow[channel] = list.appendChild(turnRow(channel, text));
    }

    // Reset silence timer
    clearTimeout(tsRowTimer[channel]);
    tsRowTimer[channel] = setTimeout(() => {
      tsLastRow[channel] = null;
    }, TS_SENTENCE_GAP_MS);

    // When THIS channel speaks, reset the OTHER channel's row
    const other = channel === 'you' ? 'them' : 'you';
    clearTimeout(tsRowTimer[other]);
    tsLastRow[other] = null;
  }
  syncTranscriptList();
}

function clearTranscriptSidebar() {
  const list = document.getElementById('ts-list');
  const ph = document.createElement('div');
  ph.className = 'ts-placeholder';
  ph.textContent = PLACEHOLDER;
  list.replaceChildren(ph);
  tsSidebarInterimEl = null;
  tsLastRow.you = null;
  tsLastRow.them = null;
  clearTimeout(tsRowTimer.you);
  clearTimeout(tsRowTimer.them);
  syncTranscriptList();
}

export function init() {
  historyBtn.addEventListener('click', toggleSidebar);
  closeSidebarBtn.addEventListener('click', hideSidebar);
  const list = document.getElementById('ts-list');
  list.addEventListener('scroll', () => updateFades(list), { passive: true });
  syncTranscriptList();
  fitActionRow();
  // Geist arrives after the first layout (font-display: swap) and changes the labels' widths.
  document.fonts.ready.then(fitActionRow);
}

export {
  appendTranscriptHistoryTurn,
  clearTranscriptSidebar,
  fitActionRow,
  hideSidebar,
  setLiveDotState,
  setSttState,
  showSidebar,
  sidebarOpen,
  sttState,
  updateSttStatus
};
