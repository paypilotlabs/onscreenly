// Settings › Knowledge: one read-only index of the user's Obsidian vault,
// refreshed when notes change, searched for the notes that match each
// question. The vault is only ever read.
const path = require('path');
const { dialog, shell } = require('electron');
const store = require('../../src/storage/store');
const { createVaultIndex, obsidianUrl } = require('../../src/knowledge/obsidian-index');
const { normalizeKnowledge, notesBlock, notesQuery, sourcesOf } = require('../../src/knowledge/knowledge-context');
const { handle } = require('./ipc-guard');
const { send } = require('./session');
const { getWin } = require('./window');

const STALE_MS = 30000; // without a folder watcher, look for edits at most this often
const MAX_TEST_QUERY_CHARS = 500;

let index = null;
let stopWatching = null;
let configKey = '';
let indexing = false;
let lastError = '';

function knowledgeSettings() {
  return normalizeKnowledge(store.getSettings().knowledge);
}

function status() {
  const k = knowledgeSettings();
  const counts = index ? index.status() : { notes: 0, chunks: 0, indexedAt: 0, truncated: false };
  return {
    enabled: k.enabled,
    vaultPath: k.vaultPath,
    vaultName: k.vaultPath ? path.basename(k.vaultPath) : '',
    ...counts,
    indexing,
    watching: !!stopWatching,
    error: lastError
  };
}

function publish() {
  send('knowledge:status', status());
}

async function reindex() {
  const target = index;
  if (!target) return status();
  indexing = true;
  publish();
  try {
    await target.refresh();
    if (target === index) lastError = '';
  } catch (e) {
    if (target === index) lastError = e && e.code === 'ENOENT' ? 'The vault folder was not found.' : e.message;
  } finally {
    if (target === index) indexing = false;
  }
  publish();
  return status();
}

/** Builds, rebuilds or drops the index to match the saved Knowledge settings. */
async function configure() {
  const k = knowledgeSettings();
  const key = k.enabled && k.vaultPath ? JSON.stringify([k.vaultPath, k.exclude]) : '';
  if (key === configKey) return status();
  configKey = key;
  if (stopWatching) stopWatching();
  stopWatching = null;
  index = null;
  indexing = false;
  lastError = '';
  if (!key) {
    publish();
    return status();
  }
  const target = createVaultIndex({ root: k.vaultPath, exclude: k.exclude });
  index = target;
  await reindex();
  if (index === target) {
    stopWatching = target.watch((result) => {
      if (index !== target) return;
      lastError = 'error' in result ? result.error : '';
      publish();
    });
    publish();
  }
  return status();
}

/**
 * Notes matching a feature's question, as a prompt block plus the note list
 * shown under the answer. Empty when Knowledge is off or nothing matches.
 * @param {string} mode
 * @param {{ transcript: Array<{ channel: string, text: string }>, userText: string, settings: object }} ctx
 */
async function retrieveNotes(mode, ctx) {
  const empty = { block: '', sources: [] };
  const target = index;
  if (!target || !knowledgeSettings().enabled) return empty;
  const query = notesQuery(mode, ctx);
  if (!query.trim()) return empty;
  if (!stopWatching && Date.now() - target.status().indexedAt > STALE_MS) {
    await target.refresh().catch(() => {});
  }
  const results = target.search(query, { limit: 5, maxChars: knowledgeSettings().maxChars });
  return { block: notesBlock(results), sources: sourcesOf(results) };
}

async function pickVault() {
  const result = await dialog.showOpenDialog(getWin(), {
    title: 'Choose your Obsidian vault folder',
    properties: ['openDirectory']
  });
  if (result.canceled || !result.filePaths.length) return status();
  store.setSettings({ knowledge: { ...knowledgeSettings(), vaultPath: result.filePaths[0], enabled: true } });
  return configure();
}

function registerKnowledgeIpc() {
  handle('knowledge:status', () => status());
  handle('knowledge:pick-vault', () => pickVault());
  handle('knowledge:forget-vault', () => {
    store.setSettings({ knowledge: { ...knowledgeSettings(), vaultPath: '', enabled: false } });
    return configure();
  });
  handle('knowledge:reindex', () => reindex());
  // The "test search" box in Settings: what a question would pull from the vault.
  handle('knowledge:search', (_e, query) => {
    if (typeof query !== 'string' || query.length > MAX_TEST_QUERY_CHARS) throw new Error('Refused: invalid query');
    if (!index) return [];
    return index
      .search(query, { limit: 5, maxChars: knowledgeSettings().maxChars })
      .map((r) => ({ relPath: r.relPath, title: r.title, heading: r.heading, snippet: r.text.slice(0, 240) }));
  });
  // Opens a note in Obsidian. Only notes in the index can be opened, so the
  // renderer cannot hand an arbitrary path or URL to the OS.
  handle('knowledge:open-note', (_e, relPath) => {
    if (!index || !index.hasNote(relPath)) throw new Error('Refused: unknown note');
    return shell.openExternal(obsidianUrl(knowledgeSettings().vaultPath, relPath));
  });
}

function stopKnowledge() {
  if (stopWatching) stopWatching();
  stopWatching = null;
}

module.exports = { configure, registerKnowledgeIpc, retrieveNotes, stopKnowledge };
