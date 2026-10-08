// Finds the DOM lookups a renderer module makes while it loads (top-level
// `const x = $('#id')` and friends). Those run before any init(), so a lookup
// that matches nothing leaves a null handle that throws on first use.
//
// moduleLoadSource() masks everything that does not run at load: comments, the
// bodies of functions and methods, and arrow-function bodies. What remains is
// scanned for lookup calls with a literal selector.

const CONTROL_KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'with']);
// A `/` after one of these starts a regular expression, not a division.
const BEFORE_EXPRESSION = new Set([
  'return',
  'typeof',
  'instanceof',
  'in',
  'of',
  'new',
  'delete',
  'void',
  'throw',
  'case',
  'do',
  'else',
  'yield',
  'await'
]);

function moduleLoadSource(src) {
  const out = src.split('');
  const stack = []; // { ch: '(' | '[' | '{' | '${', fn: boolean, owner }
  const arrows = []; // stack depths at which an arrow's expression body started
  let fnDepth = 0;
  let prev = null; // last significant token
  let lastParenOwner = null;

  const deferred = () => fnDepth > 0 || arrows.length > 0;
  const blank = (from, to) => {
    for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' ';
  };
  const endArrowsAt = (depth) => {
    while (arrows.length && arrows[arrows.length - 1] >= depth) arrows.pop();
  };
  const nextSignificant = (from) => {
    for (let k = from; k < src.length; k++) if (!/\s/.test(src[k])) return src[k];
    return null;
  };

  let i = 0;
  let inTemplate = false;
  while (i < src.length) {
    if (inTemplate) {
      const start = i;
      while (i < src.length && src[i] !== '`' && !(src[i] === '$' && src[i + 1] === '{')) i += src[i] === '\\' ? 2 : 1;
      if (deferred()) blank(start, i);
      if (src[i] === '`') {
        if (deferred()) blank(i, i + 1);
        i++;
        inTemplate = false;
        prev = '`';
      } else if (i < src.length) {
        if (deferred()) blank(i, i + 2);
        stack.push({ ch: '${', fn: false });
        i += 2;
        inTemplate = false;
        prev = '(';
      }
      continue;
    }

    const ch = src[i];
    const start = i;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      blank(start, i);
      continue;
    }
    if (ch === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? src.length : end + 2;
      blank(start, i);
      continue;
    }
    if (ch === '"' || ch === "'") {
      i++;
      while (i < src.length && src[i] !== ch && src[i] !== '\n') i += src[i] === '\\' ? 2 : 1;
      i++;
      if (deferred()) blank(start, i);
      prev = 'str';
      continue;
    }
    if (ch === '`') {
      if (deferred()) blank(i, i + 1);
      i++;
      inTemplate = true;
      continue;
    }
    if (ch === '/') {
      const isRegex = prev === null || BEFORE_EXPRESSION.has(prev) || !/^[\w$)\]}`]|^str$/.test(prev);
      if (isRegex) {
        i++;
        let inClass = false;
        while (i < src.length && src[i] !== '\n') {
          if (src[i] === '\\') i++;
          else if (src[i] === '[') inClass = true;
          else if (src[i] === ']') inClass = false;
          else if (src[i] === '/' && !inClass) break;
          i++;
        }
        i++;
        while (i < src.length && /[a-z]/i.test(src[i])) i++;
        if (deferred()) blank(start, i);
        prev = 'str';
        continue;
      }
    }
    if (/[A-Za-z_$]/.test(ch)) {
      while (i < src.length && /[\w$]/.test(src[i])) i++;
      if (deferred()) blank(start, i);
      prev = src.slice(start, i);
      continue;
    }
    if (/\d/.test(ch)) {
      while (i < src.length && /[\w.]/.test(src[i])) i++;
      if (deferred()) blank(start, i);
      prev = '0';
      continue;
    }

    // Punctuation.
    if (ch === '=' && src[i + 1] === '>') {
      if (deferred()) blank(i, i + 2);
      i += 2;
      prev = '=>';
      if (nextSignificant(i) !== '{') arrows.push(stack.length);
      continue;
    }
    if (ch === '(' || ch === '[') {
      if (deferred()) blank(i, i + 1);
      stack.push({ ch, fn: false, owner: prev });
      i++;
      prev = ch;
      continue;
    }
    if (ch === '{') {
      let fn = false;
      if (prev === '=>') fn = true;
      else if (prev === ')') fn = !CONTROL_KEYWORDS.has(lastParenOwner);
      if (deferred()) blank(i, i + 1);
      if (fn) fnDepth++;
      stack.push({ ch, fn });
      i++;
      prev = '{';
      continue;
    }
    if (ch === ')' || ch === ']' || ch === '}') {
      const top = stack.pop();
      if (top && top.fn) fnDepth--;
      endArrowsAt(stack.length + 1);
      if (deferred() || (top && top.fn)) blank(i, i + 1);
      i++;
      if (top && top.ch === '${') {
        inTemplate = true;
        continue;
      }
      if (ch === ')') lastParenOwner = top ? top.owner : null;
      prev = ch;
      continue;
    }
    if (ch === ',' || ch === ';') {
      if (deferred()) blank(i, i + 1);
      endArrowsAt(stack.length);
      i++;
      prev = ch;
      continue;
    }
    if (deferred()) blank(i, i + 1);
    i++;
    prev = ch;
  }
  return out.join('');
}

const LOOKUP =
  /(?<![\w$.])(\$|document\.querySelector|document\.querySelectorAll|document\.getElementById)\(\s*(['"])([^'"\n]*)\2\s*\)/g;

/**
 * Lookups that run when the module loads:
 *   [{ call, selector, all, name, guarded }]
 * `selector` is a CSS selector (getElementById arguments become `#id`), `all` is true for
 * querySelectorAll, `name` is the binding it is assigned to (if any), and `guarded` is true
 * when the module only uses that binding behind a null check.
 */
function moduleLoadLookups(src) {
  const masked = moduleLoadSource(src);
  const found = [];
  let m;
  LOOKUP.lastIndex = 0;
  while ((m = LOOKUP.exec(masked))) {
    const [, call, , arg] = m;
    const before = masked.slice(Math.max(0, m.index - 200), m.index);
    const decl = /(?:const|let|var)\s+([\w$]+)\s*=\s*$/.exec(before);
    const name = decl ? decl[1] : null;
    let guarded = false;
    if (name) {
      const n = name.replace(/\$/g, '\\$');
      guarded = new RegExp(String.raw`\bif\s*\(\s*!?\s*${n}\s*\)|\b${n}\?\.|\b${n}\s*&&`).test(src);
    }
    found.push({
      call,
      selector: call === 'document.getElementById' ? `#${arg}` : arg,
      all: call === 'document.querySelectorAll',
      name,
      guarded
    });
  }
  return found;
}

module.exports = { moduleLoadLookups, moduleLoadSource };
