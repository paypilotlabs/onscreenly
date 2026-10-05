// Speech status indicator and the transcript history sidebar.
import { $, icon } from './core.js';

// ---- STT / VAD status helpers ------------------------------------------
// Live dot states: 'off' | 'idle' | 'speaking' | 'transcribing'
function setLiveDotState(dotState) {
  const dot = document.getElementById('live-dot');
  if (!dot) return;
  dot.classList.remove('off', 'idle', 'speaking', 'transcribing');
  dot.classList.add(dotState);
  const labels = {
    off: 'Not listening',
    idle: 'Listening — silence detected',
    speaking: 'Speech detected',
    transcribing: 'Transcribing…'
  };
  dot.title = labels[dotState] || '';
}

let sttState = 'disconnected';

const STT_LABELS = {
  disconnected: 'Transcription off',
  connecting: 'Starting transcription…',
  loading: 'Starting transcription…',
  streaming: 'Transcription running',
  batch: 'Transcription running',
  local: 'Transcription running',
  stopping: 'Stopping transcription…',
  error: 'Transcription error'
};

function setSttState(state) {
  sttState = state;
  const label = document.getElementById('stt-status');
  if (!label) return;
  label.textContent = STT_LABELS[state];
  label.className = 'stt-status stt-' + state;
}

function updateSttStatus({ active, streaming } = {}) {
  if (active === false) setSttState('disconnected');
  else if (active === true) setSttState(streaming ? 'connecting' : 'batch');
}

// ---- transcript history sidebar (hidden by default, manual toggle) ----
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
  const onLeft = !fitsRight && fitsLeft;
  if (sidebar.classList.contains('left') === onLeft) return;
  // Switch sides without animating, so the open transition starts from the new side's tucked position.
  sidebar.classList.add('ts-instant');
  sidebar.classList.toggle('left', onLeft);
  void sidebar.offsetWidth;
  sidebar.classList.remove('ts-instant');
}

function showSidebar() {
  const sidebar = document.getElementById('transcript-sidebar');
  const historyBtn = document.getElementById('history-btn');
  if (sidebar) {
    placeSidebar(sidebar);
    sidebar.classList.add('open');
  }
  if (historyBtn) historyBtn.classList.add('active');
  sidebarOpen = true;
}

function hideSidebar() {
  const sidebar = document.getElementById('transcript-sidebar');
  const historyBtn = document.getElementById('history-btn');
  if (sidebar) sidebar.classList.remove('open');
  if (historyBtn) historyBtn.classList.remove('active');
  sidebarOpen = false;
}

function toggleSidebar() {
  if (sidebarOpen) {
    hideSidebar();
  } else {
    showSidebar();
    // FIX #7: Scroll to bottom when opening sidebar
    const list = document.getElementById('ts-list');
    if (list) {
      requestAnimationFrame(() => {
        list.scrollTop = list.scrollHeight;
      });
    }
  }
}

// History button toggle
const historyBtn = document.getElementById('history-btn');

// Close sidebar button
const closeSidebarBtn = document.getElementById('close-sidebar-btn');

function appendTranscriptHistoryTurn(channel, text, isInterim) {
  const list = document.getElementById('ts-list');
  if (!list) return;

  // Remove placeholder on first real turn
  const ph = list.querySelector('.ts-placeholder');
  if (ph) ph.remove();

  if (isInterim) {
    // Update the single floating interim row
    if (!tsSidebarInterimEl) {
      tsSidebarInterimEl = document.createElement('div');
      tsSidebarInterimEl.className = 'ts-turn ts-' + channel + ' ts-interim-row';
      const chLabel = document.createElement('span');
      chLabel.className = 'ts-channel';
      chLabel.textContent = channel === 'them' ? 'Them' : 'You';
      const txt = document.createElement('span');
      txt.className = 'ts-text ts-interim';
      tsSidebarInterimEl.appendChild(chLabel);
      tsSidebarInterimEl.appendChild(txt);
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
      if (txt) {
        txt.textContent = txt.textContent ? txt.textContent + ' ' + text : text;
      }
    } else {
      // Start a new row (no buttons — just clean history view)
      const row = document.createElement('div');
      row.className = 'ts-turn ts-' + channel;

      const chLabel = document.createElement('span');
      chLabel.className = 'ts-channel';
      chLabel.textContent = channel === 'them' ? 'Them' : 'You';

      const txt = document.createElement('span');
      txt.className = 'ts-text';
      txt.textContent = text;

      row.appendChild(chLabel);
      row.appendChild(txt);
      list.appendChild(row);
      tsLastRow[channel] = row;
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

    list.scrollTop = list.scrollHeight;
  }
}

function clearTranscriptSidebar() {
  const list = document.getElementById('ts-list');
  if (list) list.innerHTML = '<div class="ts-placeholder">Conversation history will appear here when listening.</div>';
  tsSidebarInterimEl = null;
  tsLastRow.you = null;
  tsLastRow.them = null;
  clearTimeout(tsRowTimer.you);
  clearTimeout(tsRowTimer.them);
}

export function init() {
  if (historyBtn) {
    historyBtn.querySelector('.ic').innerHTML = icon('message-square-text', { size: 14 });
    historyBtn.addEventListener('click', toggleSidebar);
  }
  if (closeSidebarBtn) {
    closeSidebarBtn.addEventListener('click', hideSidebar);
  }
}

export {
  appendTranscriptHistoryTurn,
  clearTranscriptSidebar,
  hideSidebar,
  setLiveDotState,
  setSttState,
  showSidebar,
  sidebarOpen,
  sttState,
  updateSttStatus
};
