// A small, dependency-free reader for the renderer's static HTML. It builds an
// element tree and matches simple selectors (tag, #id, .class, [attr], and the
// descendant, child and sibling combinators), so UI tests can check structure
// by parsing the markup instead of snapshotting it.
const fs = require('node:fs');
const path = require('node:path');

const RENDERER = path.join(__dirname, '..', '..', 'renderer');

const VOID = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr'
]);
// Their content is text, never markup.
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title']);

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#')
      return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function parseAttrs(src) {
  const attrs = {};
  const re = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = re.exec(src))) attrs[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  return attrs;
}

const TAG =
  /<!--[\s\S]*?-->|<![^>]*>|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/g;

/** Parses HTML into { tag, attrs, children, parent, line } nodes under a '#root' node. */
function parseHtml(html) {
  const root = { tag: '#root', attrs: {}, children: [], parent: null, line: 0 };
  let cur = root;
  const re = new RegExp(TAG.source, 'g');
  let m;
  while ((m = re.exec(html))) {
    if (m[1]) {
      const tag = m[1].toLowerCase();
      let n = cur;
      while (n !== root && n.tag !== tag) n = n.parent;
      if (n !== root) cur = n.parent;
      continue;
    }
    if (!m[2]) continue; // comment or doctype
    const tag = m[2].toLowerCase();
    const el = {
      tag,
      attrs: parseAttrs(m[3]),
      children: [],
      parent: cur,
      line: html.slice(0, m.index).split('\n').length
    };
    cur.children.push(el);
    if (RAW_TEXT.has(tag)) {
      const close = html.toLowerCase().indexOf(`</${tag}`, re.lastIndex);
      re.lastIndex = close === -1 ? html.length : close;
      cur = el; // the close tag that follows pops it
    } else if (!VOID.has(tag) && !m[4]) {
      cur = el;
    }
  }
  return root;
}

function elements(root) {
  const out = [];
  (function walk(n) {
    for (const c of n.children) {
      out.push(c);
      walk(c);
    }
  })(root);
  return out;
}

function classesOf(el) {
  return (el.attrs.class || '').split(/\s+/).filter(Boolean);
}

/** Splits a selector list at top-level commas (not inside parentheses or brackets). */
function splitSelectorList(selector) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(selector.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(selector.slice(start).trim());
  return parts.filter(Boolean);
}

const SIMPLE =
  /(#[\w-]+)|(\.[\w-]+)|\[\s*([\w-]+)\s*(?:([~|^$*]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]+))\s*)?\]|(::?[\w-]+(?:\((?:[^()]|\([^()]*\))*\))?)|(\*|[a-zA-Z][\w-]*)/y;

function parseCompound(text) {
  const c = { tag: null, id: null, classes: [], attrs: [], pseudos: [] };
  SIMPLE.lastIndex = 0;
  let pos = 0;
  while (pos < text.length) {
    SIMPLE.lastIndex = pos;
    const m = SIMPLE.exec(text);
    if (!m) throw new Error(`unsupported selector part "${text.slice(pos)}" in "${text}"`);
    if (m[1]) c.id = m[1].slice(1);
    else if (m[2]) c.classes.push(m[2].slice(1));
    else if (m[3]) c.attrs.push({ name: m[3].toLowerCase(), op: m[4], value: m[5] ?? m[6] ?? m[7] });
    else if (m[8]) c.pseudos.push(m[8]);
    else if (m[9]) c.tag = m[9].toLowerCase();
    pos = SIMPLE.lastIndex;
  }
  return c;
}

/** Parses one complex selector into compounds joined by combinators (' ', '>', '+', '~'). */
function parseComplex(selector) {
  const parts = [];
  let buf = '';
  let depth = 0;
  let quote = null;
  let combinator = null;
  const flush = () => {
    if (!buf) return;
    parts.push({ combinator: parts.length ? combinator || ' ' : null, compound: parseCompound(buf) });
    buf = '';
    combinator = null;
  };
  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i];
    if (quote) {
      if (ch === quote) quote = null;
      buf += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      buf += ch;
    } else if (ch === '(' || ch === '[') {
      depth++;
      buf += ch;
    } else if (ch === ')' || ch === ']') {
      depth--;
      buf += ch;
    } else if (depth === 0 && (ch === '>' || ch === '+' || ch === '~')) {
      flush();
      combinator = ch;
    } else if (depth === 0 && /\s/.test(ch)) {
      flush();
    } else {
      buf += ch;
    }
  }
  flush();
  return parts;
}

function attrMatches(el, a) {
  if (!(a.name in el.attrs)) return false;
  if (a.op === undefined) return true;
  const v = el.attrs[a.name];
  switch (a.op) {
    case '=':
      return v === a.value;
    case '~=':
      return v.split(/\s+/).includes(a.value);
    case '|=':
      return v === a.value || v.startsWith(`${a.value}-`);
    case '^=':
      return v.startsWith(a.value);
    case '$=':
      return v.endsWith(a.value);
    case '*=':
      return v.includes(a.value);
    default:
      return false;
  }
}

// Pseudo-classes and pseudo-elements describe runtime state, so they always match.
// `ignoreClass(name)` lets a caller treat runtime state classes (open, show, …) the same
// way, but only beside an id or a class it keeps: `.transcript-sidebar.open` still finds
// the sidebar, while a compound made only of ignored classes matches nothing.
function compoundMatches(el, c, opts) {
  if (c.tag && c.tag !== '*' && el.tag !== c.tag) return false;
  if (c.id && el.attrs.id !== c.id) return false;
  const ignored = c.classes.filter((k) => opts.ignoreClass && opts.ignoreClass(k));
  if (ignored.length && ignored.length === c.classes.length && !c.id) return false;
  const classes = classesOf(el);
  for (const k of c.classes) if (!classes.includes(k) && !ignored.includes(k)) return false;
  return c.attrs.every((a) => attrMatches(el, a));
}

function previousSiblings(el) {
  const siblings = el.parent ? el.parent.children : [];
  return siblings.slice(0, siblings.indexOf(el)).reverse();
}

function matchFrom(el, parts, i, opts) {
  if (!compoundMatches(el, parts[i].compound, opts)) return false;
  if (i === 0) return true;
  const isEl = (n) => n && n.tag !== '#root';
  switch (parts[i].combinator) {
    case '>':
      return isEl(el.parent) && matchFrom(el.parent, parts, i - 1, opts);
    case '+': {
      const prev = previousSiblings(el)[0];
      return !!prev && matchFrom(prev, parts, i - 1, opts);
    }
    case '~':
      return previousSiblings(el).some((p) => matchFrom(p, parts, i - 1, opts));
    default:
      for (let p = el.parent; isEl(p); p = p.parent) if (matchFrom(p, parts, i - 1, opts)) return true;
      return false;
  }
}

/** Elements under `root` that match `selector`, in document order. */
function querySelectorAll(root, selector, opts = {}) {
  const lists = splitSelectorList(selector).map(parseComplex);
  return elements(root).filter((el) => lists.some((parts) => matchFrom(el, parts, parts.length - 1, opts)));
}

function readRendererHtml(name) {
  const file = path.join(RENDERER, name);
  const html = fs.readFileSync(file, 'utf8');
  return { file, html, root: parseHtml(html) };
}

module.exports = {
  classesOf,
  elements,
  parseComplex,
  parseHtml,
  querySelectorAll,
  readRendererHtml,
  splitSelectorList
};
