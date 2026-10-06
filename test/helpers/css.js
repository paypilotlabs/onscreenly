// A small, dependency-free reader for the renderer's stylesheets: enough for tests
// to walk rules, declarations, @import statements and @font-face blocks without
// snapshotting any CSS.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const RENDERER = path.join(ROOT, 'renderer');

/** Every stylesheet the renderer can load: styles.css, permissions.css (if present) and css/*.css. */
function rendererCssFiles() {
  const files = ['styles.css', 'permissions.css'].map((f) => path.join(RENDERER, f)).filter((f) => fs.existsSync(f));
  const dir = path.join(RENDERER, 'css');
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir).sort()) if (f.endsWith('.css')) files.push(path.join(dir, f));
  }
  return files;
}

function relative(file) {
  return path.relative(ROOT, file).split(path.sep).join('/');
}

/** Replaces comments with spaces (keeping offsets and line numbers), leaving strings alone. */
function stripComments(css) {
  let out = '';
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < css.length && css[j] !== ch && css[j] !== '\n') j += css[j] === '\\' ? 2 : 1;
      out += css.slice(i, j + 1);
      i = j;
    } else if (ch === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      const stop = end === -1 ? css.length : end + 2;
      out += css.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop - 1;
    } else {
      out += ch;
    }
  }
  return out;
}

// Index of the first `stop` character at nesting depth 0, skipping strings and (…) groups.
function scanTo(text, from, stops) {
  let depth = 0;
  for (let i = from; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < text.length && text[j] !== ch) j += text[j] === '\\' ? 2 : 1;
      i = j;
    } else if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (depth === 0 && stops.includes(ch)) return i;
  }
  return text.length;
}

function matchingBrace(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < text.length && text[j] !== ch) j += text[j] === '\\' ? 2 : 1;
      i = j;
    } else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return i;
  }
  throw new Error(`unbalanced "{" at offset ${open}`);
}

/** Splits a declaration block into { prop, value, important } in source order. */
function parseDeclarations(body) {
  const out = [];
  let i = 0;
  while (i < body.length) {
    const end = scanTo(body, i, [';']);
    const decl = body.slice(i, end).trim();
    i = end + 1;
    if (!decl) continue;
    const colon = decl.indexOf(':');
    if (colon === -1) continue;
    let value = decl.slice(colon + 1).trim();
    const important = /!\s*important$/i.test(value);
    if (important) value = value.replace(/\s*!\s*important$/i, '');
    out.push({ prop: decl.slice(0, colon).trim(), value, important });
  }
  return out;
}

// At-rules whose block holds ordinary style rules.
const GROUPING = new Set(['media', 'supports', 'layer', 'container', 'scope', 'document']);

/**
 * Parses a stylesheet into
 *   rules:      [{ selector, declarations, context, line }]  (context = enclosing at-rule preludes)
 *   statements: [{ name, prelude, context, line }]           (@import, @layer a, b; …)
 *   atBlocks:   [{ name, prelude, body, declarations, context, line }]  (@font-face, @keyframes, …)
 */
function parseCss(css) {
  const text = stripComments(css);
  const result = { rules: [], statements: [], atBlocks: [] };
  const lineAt = (i) => text.slice(0, i).split('\n').length;

  (function walk(start, end, context) {
    let i = start;
    while (i < end) {
      while (i < end && /\s/.test(text[i])) i++;
      if (i >= end) break;
      if (text[i] === '@') {
        const name = /^@([\w-]+)/.exec(text.slice(i))[1].toLowerCase();
        const stop = scanTo(text, i, [';', '{']);
        const prelude = text.slice(i + name.length + 1, stop).trim();
        if (stop >= end || text[stop] === ';') {
          result.statements.push({ name, prelude, context, line: lineAt(i) });
          i = stop + 1;
          continue;
        }
        const close = matchingBrace(text, stop);
        if (GROUPING.has(name)) {
          walk(stop + 1, close, [...context, `@${name} ${prelude}`.trim()]);
        } else {
          const body = text.slice(stop + 1, close);
          result.atBlocks.push({
            name,
            prelude,
            body,
            declarations: parseDeclarations(body),
            context,
            line: lineAt(i)
          });
        }
        i = close + 1;
      } else {
        const open = scanTo(text, i, ['{', '}']);
        if (open >= end || text[open] === '}') break;
        const close = matchingBrace(text, open);
        result.rules.push({
          selector: text.slice(i, open).trim().replace(/\s+/g, ' '),
          declarations: parseDeclarations(text.slice(open + 1, close)),
          context,
          line: lineAt(i)
        });
        i = close + 1;
      }
    }
  })(0, text.length, []);

  return result;
}

function readCss(file) {
  const css = fs.readFileSync(file, 'utf8');
  return { file, name: relative(file), css, ...parseCss(css) };
}

module.exports = { parseCss, parseDeclarations, readCss, relative, rendererCssFiles, stripComments, RENDERER, ROOT };
