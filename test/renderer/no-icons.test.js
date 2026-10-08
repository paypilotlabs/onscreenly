// The interface is text only: no icon set, no inline SVG and no emoji. Buttons are words, keys are
// text (⌘ ⇧ ↵ on macOS, Ctrl, Shift and Enter elsewhere), and states are dots, tags and words. The
// scans read every page, script and stylesheet under renderer/.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { readCss, relative, RENDERER, ROOT } = require('../helpers/css');

function walk(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => (entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]));
}

const SOURCES = walk(RENDERER)
  .filter((file) => /\.(?:html|js|css)$/.test(file))
  .map((file) => ({ name: relative(file), text: fs.readFileSync(file, 'utf8') }));

// Pictographs (every emoji, and the variation selector that turns a symbol into one), plus the
// dingbat ticks and crosses and the return symbol that stood in for icons. The key glyphs
// ⌘ ⇧ ↵ are not pictographs and stay, as do typographic marks such as · › … —.
const PICTOGRAPH = /\p{Extended_Pictographic}|\u{FE0F}|[✓-✘⏎]/u;

// The only drawn marks left belong to controls the way a native control draws its own: the
// select's caret and the checkbox's tick, both CSS masks.
const MASKS = {
  'renderer/css/controls.css': ['-webkit-mask', 'mask'],
  'renderer/css/workspace.css': ['--mask-chevron']
};

/** Each match of `re` in a file, as "file:line …". */
function findAll(source, re) {
  const found = [];
  source.text.split('\n').forEach((line, i) => {
    const m = re.exec(line);
    if (m) found.push(`${source.name}:${i + 1} ${JSON.stringify(m[0])}`);
  });
  return found;
}

test('the scans read the renderer', () => {
  const names = SOURCES.map((s) => s.name);
  for (const name of [
    'renderer/index.html',
    'renderer/permissions.html',
    'renderer/js/core.js',
    'renderer/css/overlay.css'
  ]) {
    assert.ok(names.includes(name), `${name} is scanned`);
  }
});

test('there is no icon set, and no page loads one', () => {
  assert.equal(fs.existsSync(path.join(RENDERER, 'icons.js')), false, 'renderer/icons.js is gone');
  const found = SOURCES.filter((s) => !s.name.endsWith('.css')).flatMap((s) =>
    findAll(s, /\bicons\.js\b|\bICONS\b|\bicon\s*\(/)
  );
  assert.deepEqual(found, []);
});

test('no inline SVG in any page, script or stylesheet', () => {
  assert.deepEqual(
    SOURCES.flatMap((s) => findAll(s, /<svg\b/i)),
    []
  );
});

test('no emoji or icon glyph in any page, script or stylesheet', () => {
  assert.deepEqual(
    SOURCES.flatMap((s) => findAll(s, PICTOGRAPH)),
    []
  );
  // The pattern itself: it catches emoji and the old glyph icons, and passes key names and punctuation.
  for (const glyph of ['🔐', '🎙\u{FE0F}', '✨', '⚙', '✓', '✗', '✔', '⏎']) assert.match(glyph, PICTOGRAPH, glyph);
  for (const text of ['⌘', '⇧', '↵', 'Ctrl+Shift+L', '·', '›', '…', '—', '’', 'é', '×']) {
    assert.doesNotMatch(text, PICTOGRAPH, text);
  }
});

test('SVG data URIs appear only as the select caret and checkbox tick masks', () => {
  const problems = [];
  let masks = 0;
  for (const source of SOURCES) {
    if (!/data:image\/svg/i.test(source.text)) continue;
    const allowed = MASKS[source.name];
    if (!allowed) {
      problems.push(...findAll(source, /data:image\/svg/i));
      continue;
    }
    for (const rule of readCss(path.join(ROOT, source.name)).rules) {
      for (const d of rule.declarations.filter((x) => /data:image\/svg/i.test(x.value))) {
        if (allowed.includes(d.prop)) masks++;
        else problems.push(`${source.name}:${rule.line} ${rule.selector} { ${d.prop} }`);
      }
    }
  }
  assert.deepEqual(problems, []);
  assert.equal(masks, 3, 'the caret mask and the tick mask (with its -webkit- twin)');
});
