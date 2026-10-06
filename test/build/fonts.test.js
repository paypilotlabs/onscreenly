// The renderer's fonts ship as committed, unmodified woff2 files. A missing file,
// a bad url() or a font from the network fails silently in the app (the text just
// falls back to a system face), so these checks pin every path down in source.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { parseCss, readCss, relative, rendererCssFiles, stripComments, RENDERER, ROOT } = require('../helpers/css');
const { drift, vendorPlan, FONTS, FONT_DIR } = require('../../scripts/vendor-fonts.cjs');

const MAX_FONT_BYTES = 200 * 1024;
// family → the vendored files it may use (each declared exactly once).
const FACES = {
  Geist: ['geist-latin-wght-normal.woff2', 'geist-latin-ext-wght-normal.woff2'],
  'EB Garamond': ['eb-garamond-latin-wght-normal.woff2']
};

const woff2Files = () => fs.readdirSync(FONT_DIR).filter((f) => f.endsWith('.woff2'));
const unquote = (s) => s.trim().replace(/^(['"])(.*)\1$/, '$2');

function urls(css) {
  return [...stripComments(css).matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/g)].map(
    (m) => m[1] ?? m[2] ?? m[3]
  );
}

function importTarget(prelude) {
  const m = /^(?:url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)|"([^"]*)"|'([^']*)')/.exec(prelude);
  return m && (m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5]);
}

function fontFaces() {
  return rendererCssFiles().flatMap((file) =>
    readCss(file)
      .atBlocks.filter((b) => b.name === 'font-face')
      .map((b) => ({ file, line: b.line, decl: Object.fromEntries(b.declarations.map((d) => [d.prop, d.value])) }))
  );
}

test('every vendored font is a woff2 file', () => {
  const files = woff2Files();
  assert.equal(files.length, Object.values(FACES).flat().length);
  for (const f of files) {
    const magic = fs.readFileSync(path.join(FONT_DIR, f)).subarray(0, 4).toString('latin1');
    assert.equal(magic, 'wOF2', `${f} is not woff2`);
  }
});

test('the vendored fonts and licences are byte-equal to the npm packages', () => {
  assert.ok(vendorPlan().length > 0);
  assert.deepEqual(drift(), [], 'run node scripts/vendor-fonts.cjs');
  const pkg = require('../../package.json');
  for (const { pkg: name } of FONTS) {
    assert.match(pkg.devDependencies[name] || '', /^\d+\.\d+\.\d+$/, `${name} must be an exact devDependency`);
  }
});

test('the fonts stay under the size budget', () => {
  const total = woff2Files().reduce((sum, f) => sum + fs.statSync(path.join(FONT_DIR, f)).size, 0);
  assert.ok(total < MAX_FONT_BYTES, `fonts are ${total} bytes; the budget is ${MAX_FONT_BYTES}`);
});

test('every @import and url() in the stylesheets resolves to a file under renderer/', () => {
  let checked = 0;
  for (const file of rendererCssFiles()) {
    const sheet = readCss(file);
    const targets = [
      ...sheet.statements.filter((s) => s.name === 'import').map((s) => importTarget(s.prelude)),
      ...urls(sheet.css)
    ];
    for (const target of targets) {
      assert.ok(target, `${sheet.name}: unreadable @import`);
      assert.doesNotMatch(target, /^(https?:)?\/\//i, `${sheet.name}: remote url ${target}`);
      if (/^data:/i.test(target)) continue; // inline images; fonts are checked below
      checked++;
      const resolved = path.resolve(path.dirname(file), target.split(/[?#]/)[0]);
      const inside = path.relative(RENDERER, resolved);
      assert.ok(!inside.startsWith('..') && !path.isAbsolute(inside), `${sheet.name}: ${target} leaves renderer/`);
      assert.ok(fs.statSync(resolved, { throwIfNoEntry: false })?.isFile(), `${sheet.name}: ${target} does not exist`);
    }
  }
  assert.ok(checked > 0, 'found no @import or url(); is the parse broken?');
});

test('@import statements come first in each stylesheet (a late one is ignored)', () => {
  for (const file of rendererCssFiles()) {
    const sheet = readCss(file);
    const firstBlock = Math.min(...sheet.rules.map((r) => r.line), ...sheet.atBlocks.map((b) => b.line), Infinity);
    for (const st of sheet.statements.filter((s) => s.name === 'import')) {
      assert.ok(st.line < firstBlock, `${sheet.name}:${st.line} @import after a rule`);
      assert.deepEqual(st.context, [], `${sheet.name}:${st.line} @import inside a block`);
    }
  }
});

test('only the declared faces exist, each from its vendored file with the package unicode-range', () => {
  const faces = fontFaces();
  const used = [];
  for (const { file, line, decl } of faces) {
    const where = `${relative(file)}:${line}`;
    const family = unquote(decl['font-family'] || '');
    assert.ok(family in FACES, `${where}: undeclared face "${family}"`);
    assert.equal(decl['font-style'], 'normal', `${where}: no italic faces`);
    assert.equal(decl['font-display'], 'swap', where);
    const srcs = urls(decl.src || '');
    assert.equal(srcs.length, 1, `${where}: one src`);
    assert.doesNotMatch(srcs[0], /^(data:|https?:|\/\/)/i, `${where}: fonts load only from renderer/fonts`);
    const name = path.basename(srcs[0]);
    assert.ok(FACES[family].includes(name), `${where}: ${family} cannot use ${name}`);
    assert.equal(path.resolve(path.dirname(file), srcs[0]), path.join(FONT_DIR, name), where);
    used.push(name);

    // The unicode-range and weight axis are the package's own, so no glyph is cut off.
    const pkg = FONTS.find((f) => f.files.includes(name)).pkg;
    const pkgCss = parseCss(fs.readFileSync(require.resolve(`${pkg}/wght.css`, { paths: [ROOT] }), 'utf8'));
    const source = pkgCss.atBlocks
      .map((b) => Object.fromEntries(b.declarations.map((d) => [d.prop, d.value])))
      .find((d) => urls(d.src || '').some((u) => path.basename(u) === name));
    assert.ok(source, `${name} is not in ${pkg}/wght.css`);
    assert.equal(decl['unicode-range'], source['unicode-range'], `${where}: unicode-range`);
    assert.equal(decl['font-weight'], source['font-weight'], `${where}: font-weight`);
  }
  assert.deepEqual(used.sort(), Object.values(FACES).flat().sort(), 'each vendored file is declared exactly once');
});

test('the font licences ship beside the fonts and NOTICE names both families', () => {
  const notice = fs.readFileSync(path.join(ROOT, 'NOTICE'), 'utf8');
  for (const [family, licence] of [
    ['Geist', 'OFL-Geist.txt'],
    ['EB Garamond', 'OFL-EBGaramond.txt']
  ]) {
    const text = fs.readFileSync(path.join(FONT_DIR, licence), 'utf8');
    assert.match(text, /SIL Open Font License, Version 1\.1/, licence);
    assert.match(text, new RegExp(family.replace(' ', '\\s*')), licence);
    assert.ok(notice.includes(family), `NOTICE names ${family}`);
    assert.ok(notice.includes(`renderer/fonts/${licence}`), `NOTICE points to ${licence}`);
  }
  assert.match(notice, /SIL Open Font License 1\.1/);
});

test('git treats woff2 as binary', () => {
  const attrs = fs.readFileSync(path.join(ROOT, '.gitattributes'), 'utf8');
  assert.match(attrs, /^\*\.woff2\s+binary\s*$/m);
});

// electron-builder's `files` is an allowlist: anything it misses is silently absent from
// the packaged app. Minimal glob semantics: `**` spans folders, `*` stays in one, and a
// later `!pattern` excludes.
function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === '*' && glob[i + 1] === '*') {
      re += glob[i + 2] === '/' ? '(?:.*/)?' : '.*';
      i += glob[i + 2] === '/' ? 2 : 1;
    } else if (ch === '*') re += '[^/]*';
    else if (ch === '?') re += '[^/]';
    else re += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

test('the packaged app includes renderer/fonts and renderer/css', () => {
  delete require.cache[require.resolve('../../electron-builder.cjs')];
  const { files } = require('../../electron-builder.cjs');
  const shipped = (file) =>
    files.reduce((inc, pattern) => {
      if (pattern.startsWith('!')) return inc && !globToRegExp(pattern.slice(1)).test(file);
      return inc || globToRegExp(pattern).test(file);
    }, false);
  const wanted = [
    ...fs.readdirSync(FONT_DIR).map((f) => `renderer/fonts/${f}`),
    ...rendererCssFiles().map((f) => relative(f))
  ];
  assert.ok(
    wanted.some((f) => f.startsWith('renderer/css/')),
    'expected renderer/css/*.css'
  );
  for (const f of wanted) assert.ok(shipped(f), `${f} is not in electron-builder.cjs files`);
});
