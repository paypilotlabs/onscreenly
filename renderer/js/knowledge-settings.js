// Settings › Knowledge: choose the Obsidian vault, switch notes on or off,
// skip folders, and try a search to see which notes a question would use.
import { state } from './state.js';
import { $, onscreenly } from './core.js';

let searchTimer = null;

function formatTime(ms) {
  return ms ? new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
}

function renderStatus(status) {
  if (!status) return;
  const hasVault = !!status.vaultPath;
  $('#vault-path').textContent = hasVault
    ? `${status.vaultName} — ${status.vaultPath}`
    : 'No vault chosen. Pick the folder that holds your notes (the one with a .obsidian folder inside).';
  $('#vault-pick').textContent = hasVault ? 'Change folder…' : 'Choose vault folder…';
  $('#vault-reindex').disabled = !hasVault || !status.enabled || status.indexing;
  $('#vault-forget').disabled = !hasVault;
  $('#knowledge-enabled').disabled = !hasVault;
  const note = $('#knowledge-status');
  note.classList.toggle('warn', !!status.error);
  if (!hasVault) note.textContent = '';
  else if (status.error) note.textContent = status.error;
  else if (!status.enabled) note.textContent = 'Notes are off. Tick “Search my notes” to use them in answers.';
  else if (status.indexing && !status.indexedAt) note.textContent = 'Indexing your notes…';
  else {
    const parts = [
      `${status.notes.toLocaleString()} notes`,
      `${status.chunks.toLocaleString()} sections`,
      `indexed ${formatTime(status.indexedAt)}`
    ];
    if (status.indexing) parts.push('updating…');
    else if (status.watching) parts.push('updates as you edit');
    if (status.truncated) parts.push('stopped at 20,000 notes');
    note.textContent = parts.join(' · ');
  }
}

async function refreshStatus() {
  try {
    renderStatus(await onscreenly.knowledgeStatus());
  } catch (_) {}
}

// Main changes vaultPath and enabled itself (folder picker, Remove); keep the
// form in step so the next Save does not undo it.
function adoptStatus(status) {
  if (!status || !state.settings) return status;
  state.settings.knowledge = {
    ...(state.settings.knowledge || {}),
    enabled: status.enabled,
    vaultPath: status.vaultPath
  };
  $('#knowledge-enabled').checked = !!status.enabled;
  renderStatus(status);
  return status;
}

function fillKnowledge() {
  const k = state.settings.knowledge || {};
  $('#knowledge-enabled').checked = !!k.enabled;
  $('#knowledge-exclude').value = (k.exclude || []).join(', ');
  $('#knowledge-test').value = '';
  $('#knowledge-results').innerHTML = '';
  refreshStatus();
}

// Only the skipped folders go through the general Save; the vault folder and
// the on/off switch are set through their own calls.
function readKnowledge() {
  const exclude = $('#knowledge-exclude')
    .value.split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  state.settings.knowledge = { ...(state.settings.knowledge || {}), exclude };
}

function renderResults(results) {
  const host = $('#knowledge-results');
  host.innerHTML = '';
  if (!results.length) {
    const empty = document.createElement('div');
    empty.className = 's-note';
    empty.textContent = 'No matching notes.';
    host.append(empty);
    return;
  }
  for (const result of results) {
    const row = document.createElement('div');
    row.className = 'k-result';
    const title = document.createElement('button');
    title.type = 'button';
    title.className = 'k-result-title';
    title.textContent =
      result.heading && result.heading !== result.title ? `${result.title} › ${result.heading}` : result.title;
    title.title = 'Open in Obsidian';
    title.addEventListener('click', () => onscreenly.knowledgeOpenNote(result.relPath).catch(() => {}));
    const snippet = document.createElement('div');
    snippet.className = 'k-result-snippet';
    snippet.textContent = result.snippet;
    row.append(title, snippet);
    host.append(row);
  }
}

async function runTestSearch() {
  const query = $('#knowledge-test').value.trim().slice(0, 500);
  if (!query) {
    $('#knowledge-results').innerHTML = '';
    return;
  }
  try {
    renderResults(await onscreenly.knowledgeSearch(query));
  } catch (_) {
    $('#knowledge-results').innerHTML = '';
  }
}

export function init() {
  $('#vault-pick').addEventListener('click', async () => {
    adoptStatus(await onscreenly.knowledgePickVault().catch(() => null));
  });
  $('#vault-reindex').addEventListener('click', async () => {
    renderStatus(await onscreenly.knowledgeReindex().catch(() => null));
  });
  $('#vault-forget').addEventListener('click', async () => {
    adoptStatus(await onscreenly.knowledgeForgetVault().catch(() => null));
    $('#knowledge-results').innerHTML = '';
  });
  // Turning notes on or off takes effect at once, not when Settings closes.
  $('#knowledge-enabled').addEventListener('change', async () => {
    adoptStatus(await onscreenly.knowledgeSetEnabled($('#knowledge-enabled').checked).catch(() => null));
  });
  $('#knowledge-test').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runTestSearch, 250);
  });
  // Status pushes carry the saved on/off state too (for example while a newly
  // picked vault is still indexing), so the next Save keeps it.
  onscreenly.on('knowledge:status', adoptStatus);
}

export { fillKnowledge, readKnowledge };
