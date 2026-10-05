// @ts-check
// Turns an Obsidian Markdown note into weighted sections for the vault index:
// front matter, tags, aliases and wikilinks are read, comments and embeds are
// dropped, and the body is split at headings. Every pattern is linear or
// bounded, so an odd or hostile note cannot stall the app.
const path = require('path');

const CHUNK_CHARS = 800;
const MAX_CHUNK_CHARS = 1600;
const MAX_LABEL_CHARS = 200; // titles and headings sent with an excerpt

// How much a match in each part of a note counts.
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
 * Removes every open…close span (Obsidian %% comments %%, HTML comments) in
 * one linear pass. An unclosed opener keeps the rest of the text.
 * @param {string} text
 * @param {string} open
 * @param {string} close
 */
function stripBetween(text, open, close) {
  let out = '';
  let from = 0;
  for (;;) {
    const start = text.indexOf(open, from);
    if (start === -1) break;
    const end = text.indexOf(close, start + open.length);
    if (end === -1) break;
    out += text.slice(from, start);
    from = end + close.length;
  }
  return out + text.slice(from);
}

/** @param {string} label */
function clipLabel(label) {
  const value = String(label || '').trim();
  return value.length > MAX_LABEL_CHARS ? value.slice(0, MAX_LABEL_CHARS - 1).trimEnd() + '…' : value;
}

/**
 * A Markdown heading line ("## Results ##") → its level and text, or null.
 * Written without a backtracking regex: a long line must not stall the app.
 * A closing run of #s only counts after a space, so "## C#" stays "C#".
 * @param {string} line
 */
function parseHeading(line) {
  const open = /^#{1,6}[ \t]/.exec(line);
  if (!open) return null;
  let text = line.slice(open[0].length).trim();
  let end = text.length;
  while (end > 0 && text[end - 1] === '#') end--;
  if (end < text.length && (end === 0 || text[end - 1] === ' ' || text[end - 1] === '\t')) {
    text = text.slice(0, end).trimEnd();
  }
  return text ? { level: open[0].length - 1, text } : null;
}

/**
 * @param {string} source
 * @param {string} relPath
 * @returns {ParsedNote}
 */
function parseNote(source, relPath) {
  let text = String(source)
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n');
  let meta = { title: '', tags: [], aliases: [] };
  const frontmatter = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(text);
  if (frontmatter) {
    meta = parseFrontmatter(frontmatter[1]);
    text = text.slice(frontmatter[0].length);
  }
  // Every pattern below is bounded so a hostile or odd note cannot make the
  // regex engine backtrack for seconds.
  text = stripBetween(stripBetween(text, '%%', '%%'), '<!--', '-->')
    .replace(/!\[\[[^\]\n]{0,500}\]\]/g, '')
    .replace(/!\[[^\]\n]{0,500}\]\([^)\n]{0,2000}\)/g, '')
    .replace(/\[\[([^\]|#\n]{0,300})(?:#[^\]|\n]{0,300})?(?:\|([^\]\n]{0,300}))?\]\]/g, (_m, target, label) =>
      (label || target).trim()
    )
    .replace(/\[([^\]\n]{1,500})\]\([^)\s]{1,2000}\)/g, '$1');
  const tags = new Set(meta.tags);
  for (const match of text.matchAll(/(?:^|[\s(])#([\p{L}\p{N}_/-]{1,100})/gu)) {
    if (/[\p{L}_/-]/u.test(match[1])) tags.add(match[1]);
  }
  const title = clipLabel(meta.title || path.basename(relPath).replace(/\.md$/i, ''));
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
    const heading = !inFence && parseHeading(line);
    if (heading) {
      flush();
      trail.length = heading.level - 1;
      trail[heading.level - 1] = heading.text;
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
    heading = clipLabel(heading);
    const tf = new Map();
    const len =
      addTerms(tf, titleText, WEIGHTS.title) +
      addTerms(tf, tagText, WEIGHTS.tags) +
      addTerms(tf, heading, WEIGHTS.heading) +
      addTerms(tf, text, WEIGHTS.body);
    return { relPath, title: note.title, heading, text, tags: note.tags, tf, len };
  });
}

module.exports = { chunksOf, parseHeading, parseNote, sectionsOf, tokenize };
