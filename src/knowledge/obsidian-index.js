// @ts-check
// Read-only index of an Obsidian vault. Markdown notes are split into heading
// sections and ranked with BM25 against each question, so answers can draw on
// the user's own notes. Nothing here ever writes inside the vault.
const fs = require('fs');
const path = require('path');
const { chunksOf, parseNote, tokenize } = require('./note-parser');

/**
 * @typedef {import('./note-parser').Chunk} Chunk
 * @typedef {{ relPath: string, title: string, heading: string, text: string, score: number }} SearchResult
 */

// Hidden folders (.obsidian, .trash, .git) are always skipped as well.
const DEFAULT_EXCLUDE = ['templates'];
const MAX_FILES = 20000;
const MAX_FILE_BYTES = 1024 * 1024;
// About 50 MB of Markdown keeps the in-memory index well under a few hundred
// MB; notes past it are left out and the status says the index is incomplete.
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
// On Linux, Node's recursive fs.watch adds one inotify watch per file and
// folder, hidden ones included; Onscreenly watches the visited folders itself
// and stops watching past this many.
const MAX_WATCHED_DIRS = 2000;

// BM25 parameters.
const K1 = 1.2;
const B = 0.75;

/**
 * True when a vault-relative path is inside an excluded folder. An entry
 * without a slash ("templates") matches a folder of that name anywhere; an
 * entry with one ("Work/Old") matches that path from the vault root.
 * @param {string} relPath forward-slash path relative to the vault
 * @param {string[]} exclude
 */
function isExcluded(relPath, exclude) {
  const lower = relPath.toLowerCase();
  const segments = lower.split('/');
  for (const raw of exclude) {
    const entry = String(raw || '')
      .trim()
      .replace(/\\/g, '/')
      .replace(/^\/+|\/+$/g, '')
      .toLowerCase();
    if (!entry) continue;
    if (entry.includes('/')) {
      if (lower === entry || lower.startsWith(entry + '/')) return true;
    } else if (segments.slice(0, -1).includes(entry) || lower === entry) {
      return true;
    }
  }
  return false;
}

/**
 * Lists the vault's Markdown files. Hidden folders and symbolic links are
 * skipped, so the walk never leaves the vault or loops.
 * @param {string} root
 * @param {string[]} exclude
 */
async function listMarkdownFiles(root, exclude) {
  /** @type {string[]} */
  const files = [];
  /** @type {string[]} */
  const dirs = [];
  let truncated = false;
  const pending = [''];
  while (pending.length) {
    const rel = /** @type {string} */ (pending.shift());
    dirs.push(rel);
    let entries;
    try {
      entries = await fs.promises.readdir(path.join(root, rel), { withFileTypes: true });
    } catch (_) {
      continue;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      const childRel = rel ? rel + '/' + entry.name : entry.name;
      // A trailing slash makes a folder's own name count as a parent folder.
      if (isExcluded(entry.isDirectory() ? childRel + '/' : childRel, exclude)) continue;
      if (entry.isDirectory()) pending.push(childRel);
      else if (entry.isFile() && /\.md$/i.test(entry.name)) {
        if (files.length >= MAX_FILES) {
          truncated = true;
          break;
        }
        files.push(childRel);
      }
    }
    if (truncated) break;
  }
  return { files, dirs, truncated };
}

/**
 * Reads a note without following a symbolic link, even one swapped in after
 * the folder listing, and only if it still resolves inside the vault.
 * Resolves null when the path is no longer a regular file inside the vault.
 * @param {string} vaultReal real path of the vault folder
 * @param {string} full
 */
async function readNoteFile(vaultReal, full) {
  const real = await fs.promises.realpath(full);
  if (!real.startsWith(vaultReal + path.sep)) return null;
  const handle = await fs.promises.open(full, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    const info = await handle.stat();
    if (!info.isFile()) return null;
    if (info.size > MAX_FILE_BYTES) return { info, text: null };
    return { info, text: await handle.readFile('utf8') };
  } finally {
    await handle.close();
  }
}

/**
 * Builds the obsidian:// link that opens a note in the Obsidian app. Obsidian
 * names a vault after its folder unless the user renamed it.
 * @param {string} vaultPath
 * @param {string} relPath
 */
function obsidianUrl(vaultPath, relPath) {
  const vault = path.basename(path.resolve(vaultPath));
  const file = relPath.replace(/\.md$/i, '');
  return `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(file)}`;
}

/**
 * @param {{ root: string, exclude?: string[], maxTotalBytes?: number, maxWatchedDirs?: number }} options
 */
function createVaultIndex({
  root,
  exclude = DEFAULT_EXCLUDE,
  maxTotalBytes = MAX_TOTAL_BYTES,
  maxWatchedDirs = MAX_WATCHED_DIRS
}) {
  const vaultRoot = path.resolve(root);
  /** @type {Map<string, { mtimeMs: number, size: number, chunks: Chunk[] }>} */
  const files = new Map();
  /** @type {{ chunks: Chunk[], df: Map<string, number>, avgLen: number } | null} */
  let stats = null;
  let indexedAt = 0;
  let truncated = false;
  let refreshing = null;
  let refreshAgain = false;
  /** @type {string[]} */
  let dirs = [];

  function rebuildStats() {
    const chunks = [];
    for (const file of files.values()) chunks.push(...file.chunks);
    const df = new Map();
    let total = 0;
    for (const chunk of chunks) {
      total += chunk.len;
      for (const term of chunk.tf.keys()) df.set(term, (df.get(term) || 0) + 1);
    }
    stats = { chunks, df, avgLen: chunks.length ? total / chunks.length : 0 };
    return stats;
  }

  function forgetAll() {
    if (files.size) stats = null;
    files.clear();
    dirs = [];
  }

  async function doRefresh() {
    let vaultReal;
    try {
      const stat = await fs.promises.stat(vaultRoot);
      if (!stat.isDirectory()) throw new Error('The vault path is not a folder.');
      vaultReal = await fs.promises.realpath(vaultRoot);
    } catch (e) {
      // A vault that is gone must stop feeding answers.
      forgetAll();
      throw e;
    }
    const listing = await listMarkdownFiles(vaultRoot, exclude);
    truncated = listing.truncated;
    dirs = listing.dirs;
    const seen = new Set(listing.files);
    let changed = 0;
    for (const relPath of [...files.keys()]) {
      if (!seen.has(relPath)) {
        files.delete(relPath);
        changed++;
      }
    }
    let totalBytes = 0;
    for (const relPath of listing.files) {
      const full = path.join(vaultRoot, relPath);
      let info;
      try {
        info = await fs.promises.lstat(full);
      } catch (_) {
        info = null;
      }
      if (!info || !info.isFile()) {
        if (files.delete(relPath)) changed++;
        continue;
      }
      if (info.size <= MAX_FILE_BYTES) totalBytes += info.size;
      if (totalBytes > maxTotalBytes) {
        truncated = true;
        if (files.delete(relPath)) changed++;
        continue;
      }
      const known = files.get(relPath);
      if (known && known.mtimeMs === info.mtimeMs && known.size === info.size) continue;
      let read = null;
      try {
        read = await readNoteFile(vaultReal, full);
      } catch (_) {
        read = null;
      }
      if (!read) {
        if (files.delete(relPath)) changed++;
        continue;
      }
      const chunks = read.text === null ? [] : chunksOf(parseNote(read.text, relPath), relPath);
      files.set(relPath, { mtimeMs: info.mtimeMs, size: info.size, chunks });
      changed++;
    }
    if (changed || !stats) stats = null;
    indexedAt = Date.now();
    return { changed };
  }

  /**
   * Re-reads notes added, changed or removed since the last refresh. A call
   * made while a refresh is running schedules one more pass after it, so a
   * change made mid-refresh is never missed.
   */
  function refresh() {
    if (refreshing) {
      refreshAgain = true;
      return refreshing;
    }
    refreshing = (async () => {
      let result;
      do {
        refreshAgain = false;
        result = await doRefresh();
      } while (refreshAgain);
      return result;
    })().finally(() => {
      refreshing = null;
      refreshAgain = false;
    });
    return refreshing;
  }

  /**
   * @param {string} query
   * @param {{ limit?: number, maxChars?: number, perNote?: number }} [options]
   * @returns {SearchResult[]}
   */
  function search(query, { limit = 5, maxChars = 3000, perNote = 2 } = {}) {
    const terms = [...new Set(tokenize(query))];
    if (!terms.length) return [];
    const { chunks, df, avgLen } = stats || rebuildStats();
    const n = chunks.length;
    if (!n) return [];
    const scored = [];
    for (const chunk of chunks) {
      let score = 0;
      for (const term of terms) {
        const freq = chunk.tf.get(term);
        if (!freq) continue;
        const docs = df.get(term) || 0;
        const idf = Math.log(1 + (n - docs + 0.5) / (docs + 0.5));
        score += (idf * (freq * (K1 + 1))) / (freq + K1 * (1 - B + (B * chunk.len) / (avgLen || 1)));
      }
      if (score > 0) scored.push({ chunk, score });
    }
    scored.sort((a, b) => b.score - a.score || a.chunk.relPath.localeCompare(b.chunk.relPath));
    if (!scored.length) return [];
    // Weak matches far below the best one are mostly noise in the prompt.
    const floor = scored[0].score * 0.35;
    /** @type {SearchResult[]} */
    const results = [];
    const perNoteCount = new Map();
    let used = 0;
    for (const { chunk, score } of scored) {
      if (score < floor || results.length >= limit) break;
      const count = perNoteCount.get(chunk.relPath) || 0;
      if (count >= perNote) continue;
      // Title and heading travel with the excerpt, so they count too.
      const labels = chunk.title.length + chunk.heading.length;
      const room = maxChars - used - labels;
      if (room < 200) break;
      const text = chunk.text.length > room ? chunk.text.slice(0, room).trimEnd() + '…' : chunk.text;
      results.push({ relPath: chunk.relPath, title: chunk.title, heading: chunk.heading, text, score });
      perNoteCount.set(chunk.relPath, count + 1);
      used += labels + text.length;
    }
    return results;
  }

  /**
   * Watches the vault and refreshes after edits settle. macOS and Windows get
   * one native recursive watch; on Linux each indexed folder gets its own
   * watch, so hidden and excluded folders cost nothing. Returns a stop
   * function, or null when the vault cannot be watched; the caller then
   * refreshes on demand. onChange receives { stopped: true } when watching
   * had to stop (too many folders), and { error } when a refresh failed.
   * @param {(result: { changed: number } | { error: string } | { stopped: true }) => void} onChange
   * @param {{ delayMs?: number, platform?: string }} [options]
   */
  function watch(onChange, { delayMs = 1500, platform = process.platform } = {}) {
    const perFolder = platform === 'linux';
    /** @type {Map<string, fs.FSWatcher>} */
    const watchers = new Map();
    let timer = null;
    let stopped = false;

    const closeAll = () => {
      for (const watcher of watchers.values()) watcher.close();
      watchers.clear();
    };
    // Obsidian rewrites .obsidian/workspace.json constantly; only notes and
    // folders matter.
    const relevant = (filename) => {
      const name = String(filename || '').replace(/\\/g, '/');
      if (name.split('/').some((part) => part.startsWith('.'))) return false;
      return !path.extname(name) || /\.md$/i.test(name);
    };
    const add = (rel, recursive) => {
      const watcher = fs.watch(
        rel ? path.join(vaultRoot, rel) : vaultRoot,
        { recursive, persistent: false },
        (_event, filename) => {
          if (relevant(filename)) schedule();
        }
      );
      watcher.on('error', () => {}); // a removed folder; the next refresh drops it
      watchers.set(rel, watcher);
    };
    // Matches the watched folders to the folders the last refresh visited.
    const syncFolders = () => {
      if (dirs.length > maxWatchedDirs) {
        closeAll();
        return false;
      }
      const wanted = new Set(dirs);
      for (const [rel, watcher] of watchers) {
        if (!wanted.has(rel)) {
          watcher.close();
          watchers.delete(rel);
        }
      }
      for (const rel of dirs) {
        if (watchers.has(rel)) continue;
        try {
          add(rel, false);
        } catch (_) {}
      }
      return true;
    };
    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(() => {
        refresh().then(
          (result) => {
            if (stopped) return;
            if (perFolder && !syncFolders()) {
              stopped = true;
              onChange({ stopped: true });
              return;
            }
            onChange(result);
          },
          (e) => {
            if (!stopped) onChange({ error: e && e.message ? e.message : String(e) });
          }
        );
      }, delayMs);
    }

    try {
      if (perFolder) {
        if (!syncFolders() || !watchers.size) return null;
      } else {
        add('', true);
      }
    } catch (_) {
      closeAll();
      return null;
    }
    return () => {
      stopped = true;
      clearTimeout(timer);
      closeAll();
    };
  }

  /** @param {string} relPath */
  function hasNote(relPath) {
    return typeof relPath === 'string' && files.has(relPath);
  }

  function status() {
    let chunkCount = 0;
    let notes = 0;
    for (const file of files.values()) {
      if (file.chunks.length) notes++;
      chunkCount += file.chunks.length;
    }
    return { notes, chunks: chunkCount, indexedAt, truncated };
  }

  return { root: vaultRoot, refresh, search, watch, hasNote, status };
}

module.exports = {
  DEFAULT_EXCLUDE,
  MAX_FILES,
  MAX_TOTAL_BYTES,
  MAX_WATCHED_DIRS,
  readNoteFile,
  createVaultIndex,
  isExcluded,
  obsidianUrl
};
