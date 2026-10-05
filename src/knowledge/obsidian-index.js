// @ts-check
// Read-only index of an Obsidian vault. Markdown notes are split into heading
// sections and ranked with BM25 against each question, so answers can draw on
// the user's own notes. Nothing here ever writes inside the vault.
const fs = require('fs');
const path = require('path');

// Hidden folders (.obsidian, .trash, .git) are always skipped as well.
const DEFAULT_EXCLUDE = ['templates'];
const MAX_FILES = 20000;
const MAX_FILE_BYTES = 1024 * 1024;
const CHUNK_CHARS = 800;
const MAX_CHUNK_CHARS = 1600;

// BM25 parameters and how much a match in each part of a note counts.
const K1 = 1.2;
const B = 0.75;
const WEIGHTS = { title: 3, tags: 2, heading: 2, body: 1 };

const STOPWORDS = new Set(
  (
    'a an and are as at be been but by can could did do does for from had has have he her here hers him his how i if ' +
    'in into is it its just me my of on or our ours she so than that the their them then there these they this those ' +
    'to too us was we were what when where which while who whom why will with would you your yours about also any ' +
    'some such no not only own same very s t don should now am being both each few more most other over under again ' +
    'further once all out up down off above below between through during before after'
  ).split(' ')
);

/**
 * @typedef {{ title: string, tags: string[], aliases: string[], body: string }} ParsedNote
 * @typedef {{ relPath: string, title: string, heading: string, text: string, tags: string[],
 *   tf: Map<string, number>, len: number }} Chunk
 * @typedef {{ relPath: string, title: string, heading: string, text: string, score: number }} SearchResult
 */

/** @param {string} word */
function stem(word) {
  if (word.length > 4 && word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us')) return word.slice(0, -1);
  return word;
}

/**
 * Lower-cased word stems without stop words. Keeps "c++" and "c#" whole.
 * @param {string} text
 */
function tokenize(text) {
  const out = [];
  for (const match of String(text || '')
    .toLowerCase()
    .matchAll(/[\p{L}\p{N}]+(?:\+\+|#)?/gu)) {
    const word = match[0];
    if (word.length < 2 && !/\d/.test(word)) continue;
    if (STOPWORDS.has(word)) continue;
    out.push(stem(word));
  }
  return out;
}

/** @param {string} value */
function listValue(value) {
  const trimmed = value.trim();
  if (!trimmed) return [];
  const inner = trimmed.startsWith('[') && trimmed.endsWith(']') ? trimmed.slice(1, -1) : trimmed;
  return inner
    .split(',')
    .map((item) => item.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

/**
 * The small part of YAML front matter notes use: title, tags and aliases,
 * written inline ("tags: [a, b]") or as a list ("tags:\n  - a").
 * @param {string} yaml
 */
function parseFrontmatter(yaml) {
  const meta = { title: '', tags: [], aliases: [] };
  let listKey = '';
  for (const line of yaml.split('\n')) {
    const item = /^\s*-\s+(.*)$/.exec(line);
    if (item && listKey) {
      meta[listKey].push(...listValue(item[1]));
      continue;
    }
    const pair = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    listKey = '';
    if (!pair) continue;
    const key = pair[1].toLowerCase();
    const value = pair[2];
    if (key === 'title') meta.title = value.trim().replace(/^["']|["']$/g, '');
    else if (key === 'tags' || key === 'tag' || key === 'aliases' || key === 'alias') {
      const target = key.startsWith('tag') ? 'tags' : 'aliases';
      if (value.trim()) meta[target].push(...listValue(value));
      else listKey = target;
    }
  }
  meta.tags = meta.tags.map((tag) => tag.replace(/^#/, ''));
  return meta;
}

/**
 * @param {string} source
 * @param {string} relPath
 * @returns {ParsedNote}
 */
function parseNote(source, relPath) {
  let text = String(source).replace(/\r\n?/g, '\n');
  let meta = { title: '', tags: [], aliases: [] };
  const frontmatter = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(text);
  if (frontmatter) {
    meta = parseFrontmatter(frontmatter[1]);
    text = text.slice(frontmatter[0].length);
  }
  text = text
    .replace(/%%[\s\S]*?%%/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/!\[\[[^\]]*\]\]/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[\[([^\]|#]*)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g, (_m, target, label) => (label || target).trim())
    .replace(/\[([^\]]+)\]\((?:[^)\s]+)\)/g, '$1');
  const tags = new Set(meta.tags);
  for (const match of text.matchAll(/(?:^|[\s(])#([\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)/gu)) tags.add(match[1]);
  const title = meta.title || path.basename(relPath).replace(/\.md$/i, '');
  return { title, tags: [...tags], aliases: meta.aliases, body: text };
}

/**
 * Splits a long section at paragraph breaks into pieces of about CHUNK_CHARS.
 * @param {string} text
 */
function splitSection(text) {
  const pieces = [];
  let current = '';
  for (const paragraph of text.split(/\n\s*\n/)) {
    const para = paragraph.trim();
    if (!para) continue;
    if (current && current.length + para.length + 2 > CHUNK_CHARS) {
      pieces.push(current);
      current = '';
    }
    current = current ? current + '\n\n' + para : para;
    while (current.length > MAX_CHUNK_CHARS) {
      const cut = current.lastIndexOf(' ', CHUNK_CHARS);
      const at = cut > CHUNK_CHARS / 2 ? cut : CHUNK_CHARS;
      pieces.push(current.slice(0, at).trim());
      current = current.slice(at).trim();
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

/**
 * Sections of a note body, each with its heading trail ("Projects › Payments").
 * @param {string} body
 */
function sectionsOf(body) {
  const sections = [];
  const trail = [];
  let lines = [];
  let inFence = false;
  const flush = () => {
    const text = lines.join('\n').trim();
    if (text) {
      const heading = trail.filter(Boolean).join(' › ');
      for (const piece of splitSection(text)) sections.push({ heading, text: piece });
    }
    lines = [];
  };
  for (const line of body.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const heading = !inFence && /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      flush();
      const level = heading[1].length;
      trail.length = level - 1;
      trail[level - 1] = heading[2];
      continue;
    }
    lines.push(line);
  }
  flush();
  return sections;
}

/**
 * @param {Map<string, number>} tf
 * @param {string} text
 * @param {number} weight
 */
function addTerms(tf, text, weight) {
  let count = 0;
  for (const term of tokenize(text)) {
    tf.set(term, (tf.get(term) || 0) + weight);
    count += weight;
  }
  return count;
}

/**
 * @param {ParsedNote} note
 * @param {string} relPath
 * @returns {Chunk[]}
 */
function chunksOf(note, relPath) {
  const titleText = [note.title, ...note.aliases].join(' ');
  const tagText = note.tags.join(' ').replace(/[/_-]/g, ' ');
  return sectionsOf(note.body).map((section) => {
    const { text } = section;
    // Most notes open with an H1 that repeats the title; keep only what follows it.
    let heading = section.heading;
    if (heading === note.title) heading = '';
    else if (heading.startsWith(note.title + ' › ')) heading = heading.slice(note.title.length + 3);
    const tf = new Map();
    const len =
      addTerms(tf, titleText, WEIGHTS.title) +
      addTerms(tf, tagText, WEIGHTS.tags) +
      addTerms(tf, heading, WEIGHTS.heading) +
      addTerms(tf, text, WEIGHTS.body);
    return { relPath, title: note.title, heading, text, tags: note.tags, tf, len };
  });
}

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
  let truncated = false;
  const pending = [''];
  while (pending.length) {
    const rel = /** @type {string} */ (pending.shift());
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
  return { files, truncated };
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
 * @param {{ root: string, exclude?: string[] }} options
 */
function createVaultIndex({ root, exclude = DEFAULT_EXCLUDE }) {
  const vaultRoot = path.resolve(root);
  /** @type {Map<string, { mtimeMs: number, size: number, chunks: Chunk[] }>} */
  const files = new Map();
  /** @type {{ chunks: Chunk[], df: Map<string, number>, avgLen: number } | null} */
  let stats = null;
  let indexedAt = 0;
  let truncated = false;
  let refreshing = null;

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

  async function doRefresh() {
    const stat = await fs.promises.stat(vaultRoot);
    if (!stat.isDirectory()) throw new Error('The vault path is not a folder.');
    const listing = await listMarkdownFiles(vaultRoot, exclude);
    truncated = listing.truncated;
    const seen = new Set(listing.files);
    let changed = 0;
    for (const relPath of [...files.keys()]) {
      if (!seen.has(relPath)) {
        files.delete(relPath);
        changed++;
      }
    }
    for (const relPath of listing.files) {
      const full = path.join(vaultRoot, relPath);
      let info;
      try {
        info = await fs.promises.stat(full);
      } catch (_) {
        continue;
      }
      const known = files.get(relPath);
      if (known && known.mtimeMs === info.mtimeMs && known.size === info.size) continue;
      let chunks = [];
      if (info.size <= MAX_FILE_BYTES) {
        try {
          chunks = chunksOf(parseNote(await fs.promises.readFile(full, 'utf8'), relPath), relPath);
        } catch (_) {
          chunks = [];
        }
      }
      files.set(relPath, { mtimeMs: info.mtimeMs, size: info.size, chunks });
      changed++;
    }
    if (changed || !stats) stats = null;
    indexedAt = Date.now();
    return { changed };
  }

  /** Re-reads notes added, changed or removed since the last refresh. */
  function refresh() {
    if (!refreshing) {
      refreshing = doRefresh().finally(() => {
        refreshing = null;
      });
    }
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
      const room = maxChars - used;
      if (room < 200) break;
      const text = chunk.text.length > room ? chunk.text.slice(0, room).trimEnd() + '…' : chunk.text;
      results.push({ relPath: chunk.relPath, title: chunk.title, heading: chunk.heading, text, score });
      perNoteCount.set(chunk.relPath, count + 1);
      used += text.length;
    }
    return results;
  }

  /**
   * Watches the vault and refreshes after edits settle. Returns a stop
   * function, or null when the platform cannot watch folders recursively.
   * @param {(result: { changed: number } | { error: string }) => void} onChange
   * @param {number} [delayMs]
   */
  function watch(onChange, delayMs = 1500) {
    let timer = null;
    let watcher;
    try {
      watcher = fs.watch(vaultRoot, { recursive: true, persistent: false }, (_event, filename) => {
        const name = String(filename || '').replace(/\\/g, '/');
        // Obsidian rewrites .obsidian/workspace.json constantly; only notes
        // and folders matter.
        if (name.split('/').some((part) => part.startsWith('.'))) return;
        if (path.extname(name) && !/\.md$/i.test(name)) return;
        clearTimeout(timer);
        timer = setTimeout(() => {
          refresh().then(onChange, (e) => onChange({ error: e && e.message ? e.message : String(e) }));
        }, delayMs);
      });
      watcher.on('error', () => {});
    } catch (_) {
      return null;
    }
    return () => {
      clearTimeout(timer);
      watcher.close();
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
  createVaultIndex,
  isExcluded,
  obsidianUrl,
  parseNote,
  sectionsOf,
  tokenize
};
