// Structural guards for the renderer's markup, scripts and styles. They hold
// before the redesign and must keep holding through it, so every check parses
// the current files instead of comparing them with a snapshot.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { readCss, rendererCssFiles, relative, RENDERER, ROOT } = require('../helpers/css');
const {
  classesOf,
  elements,
  parseComplex,
  querySelectorAll,
  readRendererHtml,
  splitSelectorList
} = require('../helpers/markup');
const { moduleLoadLookups, moduleLoadSource } = require('../helpers/module-scan');
const { rendererModule, rendererModuleFiles } = require('../helpers/renderer-source');

const index = readRendererHtml('index.html');
const permissions = readRendererHtml('permissions.html');

// Ids the renderer creates or copies at runtime (get-or-create, or a <template> copy), so
// they may appear more than once in markup, or both in markup and in a script. None do
// today; '#onscreenly-status', '#toast' and '#ob-publik-terms' are the candidates.
const DYNAMIC_IDS = new Set([]);

// Looked up in init() rather than at load, and kept in the DOM even while hidden
// (the Settings shortcut listener in settings-panel.js still binds to it).
const KEPT_HANDLES = ['#more-btn'];

function idCounts(root) {
  const counts = new Map();
  for (const el of elements(root)) {
    if (el.attrs.id === undefined) continue;
    counts.set(el.attrs.id, (counts.get(el.attrs.id) || 0) + 1);
  }
  return counts;
}

// Ids that renderer scripts assign at runtime: `el.id = 'x'` and `id="x"` inside markup strings.
function scriptCreatedIds() {
  const ids = new Map();
  for (const file of rendererModuleFiles()) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const m of src.matchAll(/\.id\s*=\s*(['"`])([\w-]+)\1|\bid=\\?(['"])([\w-]+)\\?\3/g)) {
      const id = m[2] || m[4];
      if (!ids.has(id)) ids.set(id, file);
    }
  }
  return ids;
}

test('static ids are unique in index.html and permissions.html', () => {
  for (const page of [index, permissions]) {
    const counts = idCounts(page.root);
    assert.ok(counts.size > 0, `${relative(page.file)}: no ids found; is the parser broken?`);
    const dupes = [...counts].filter(([id, n]) => n > 1 && !DYNAMIC_IDS.has(id)).map(([id, n]) => `#${id} ×${n}`);
    assert.deepEqual(dupes, [], `${relative(page.file)} repeats ids`);
  }
});

test('ids created by renderer scripts do not collide with static ids in index.html', () => {
  const created = scriptCreatedIds();
  assert.ok(created.size > 0, 'found no script-created ids; is the scan broken?');
  const counts = idCounts(index.root);
  const clashes = [...created]
    .filter(([id]) => counts.has(id) && !DYNAMIC_IDS.has(id))
    .map(([id, file]) => `#${id} (${file})`);
  assert.deepEqual(clashes, [], 'add get-or-create ids to DYNAMIC_IDS, or rename them');
  for (const id of DYNAMIC_IDS) assert.ok(created.has(id) || counts.has(id), `DYNAMIC_IDS lists unused #${id}`);
});

test('the module-load scanner keeps load-time code and masks function bodies', () => {
  const src = [
    "const a = $('#load');",
    "const re = /`{1,3}/; const s = `${$('#tpl')}`;",
    "function f() { return $('#later'); }",
    "const g = () => $('#arrow'), h = document.getElementById('also-load');",
    "const obj = { k: document.querySelector('.in-object') };",
    "export function init() { if (x) { $('#nested'); } }"
  ].join('\n');
  assert.equal(moduleLoadSource(src).length, src.length);
  const selectors = moduleLoadLookups(src).map((l) => l.selector);
  assert.deepEqual(selectors, ['#load', '#tpl', '#also-load', '.in-object']);
});

test('every DOM handle a renderer module looks up at load exists in index.html', () => {
  let total = 0;
  for (const file of rendererModuleFiles()) {
    for (const lookup of moduleLoadLookups(rendererModule(path.basename(file)))) {
      total++;
      const where = `${file}: ${lookup.call}('${lookup.selector}')`;
      const matches = querySelectorAll(index.root, lookup.selector);
      if (matches.length) continue;
      // A handle the module only uses behind a null check may lack its inner part (an
      // icon slot, say), but the element it hangs off must still be there.
      const anchor = parseComplex(splitSelectorList(lookup.selector)[0])[0].compound.id;
      assert.ok(lookup.guarded && anchor, `${where} matches nothing in renderer/index.html`);
      assert.equal(querySelectorAll(index.root, `#${anchor}`).length, 1, `${where}: #${anchor} is missing`);
    }
  }
  assert.ok(total > 0, 'found no module-load lookups; is the scan broken?');
  for (const sel of KEPT_HANDLES) assert.equal(querySelectorAll(index.root, sel).length, 1, `${sel} must stay`);
});

test('Settings tabs keep their order, and each tab has its pane', () => {
  const tabs = querySelectorAll(index.root, '[data-tab]').map((el) => el.attrs['data-tab']);
  assert.deepEqual(tabs, ['keys', 'profile', 'knowledge', 'transcription', 'style', 'appearance']);
  for (const tab of tabs) {
    assert.equal(querySelectorAll(index.root, `[data-pane="${tab}"]`).length, 1, `pane for "${tab}"`);
  }
});

test('the action row has exactly the say, assist and recap buttons, one of them primary', () => {
  const acts = querySelectorAll(index.root, '#action-row .act');
  assert.deepEqual(
    acts.map((el) => el.attrs['data-mode']),
    ['say', 'assist', 'recap']
  );
  for (const el of acts) assert.equal(el.tag, 'button');
  const primary = querySelectorAll(index.root, '#action-row .act-primary');
  assert.equal(primary.length, 1);
  assert.ok(classesOf(primary[0]).includes('act'), 'the primary action is one of the three .act buttons');
});

// Stylesheets the main window loads: its <link>s and everything they @import.
function indexStylesheets() {
  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file) || !fs.existsSync(file)) return;
    seen.add(file);
    for (const st of readCss(file).statements) {
      if (st.name !== 'import') continue;
      const m = /^(?:url\(\s*)?(['"])([^'"]+)\1/.exec(st.prelude);
      if (m) visit(path.resolve(path.dirname(file), m[2]));
    }
  };
  for (const link of querySelectorAll(index.root, 'link[rel="stylesheet"]')) {
    visit(path.join(RENDERER, link.attrs.href));
  }
  return [...seen];
}

function clickThroughIds() {
  const src = rendererModule('window-behaviour.js');
  const lists = [...src.matchAll(/\.closest\(\s*(['"])([^'"]+)\1\s*\)/g)]
    .map((m) => splitSelectorList(m[2]))
    .filter((list) => list.every((s) => /^#[\w-]+$/.test(s)) && list.includes('#toolbar'));
  assert.equal(lists.length, 1, 'expected one closest() id list (with #toolbar) in window-behaviour.js');
  return new Set(lists[0].map((s) => s.slice(1)));
}

// The renderer makes the window click-through wherever the pointer is not over one of the
// ids in window-behaviour.js's closest() list. CSS that gives an element pointer events
// must therefore name only listed ids: by id (#toolbar), or through a class on an element
// that carries a listed id (.transcript-sidebar.open is #transcript-sidebar). An element
// without an id must sit inside a listed one.
test('the click-through ids cover every id that CSS gives pointer events', () => {
  const ids = clickThroughIds();
  const sheets = indexStylesheets();
  assert.ok(sheets.length > 0, 'index.html links no stylesheet');
  // Classes no static element carries (open, show, …) are runtime state: ignore them.
  const staticClasses = new Set(elements(index.root).flatMap(classesOf));
  const ignoreClass = (k) => !staticClasses.has(k);
  const insideListed = (el) => {
    for (let n = el.parent; n && n.tag !== '#root'; n = n.parent) if (ids.has(n.attrs.id)) return true;
    return false;
  };

  const cssIds = new Set();
  const problems = [];
  for (const file of sheets) {
    for (const rule of readCss(file).rules) {
      if (!rule.declarations.some((d) => d.prop === 'pointer-events' && d.value !== 'none')) continue;
      for (const selector of splitSelectorList(rule.selector)) {
        const where = `${relative(file)}:${rule.line} "${selector}"`;
        const parts = parseComplex(selector);
        const subjectId = parts[parts.length - 1].compound.id;
        if (subjectId) {
          cssIds.add(subjectId);
          continue;
        }
        const matches = querySelectorAll(index.root, selector, { ignoreClass });
        for (const el of matches) {
          if (el.attrs.id) cssIds.add(el.attrs.id);
          else if (!insideListed(el)) problems.push(`${where} takes the mouse outside the listed ids`);
        }
        if (!matches.length && !parts.slice(0, -1).some((p) => ids.has(p.compound.id))) {
          problems.push(`${where} matches nothing in index.html, so its click-through cannot be checked`);
        }
      }
    }
  }
  assert.deepEqual(problems, []);
  assert.ok(cssIds.size > 0, 'found no pointer-events ids; is the CSS parse broken?');
  const missing = [...cssIds].filter((id) => !ids.has(id)).map((id) => `#${id}`);
  assert.deepEqual(missing, [], 'add these to the closest() list in renderer/js/window-behaviour.js');
});

test('--main-w and --side-w match MAIN_W and SIDE_W in app/main/window.js', () => {
  const windowJs = fs.readFileSync(path.join(ROOT, 'app', 'main', 'window.js'), 'utf8');
  const constant = (name) => {
    const found = [...windowJs.matchAll(new RegExp(String.raw`\b${name}\s*=\s*(\d+)\b`, 'g'))];
    assert.equal(found.length, 1, `expected one ${name} in app/main/window.js`);
    return `${found[0][1]}px`;
  };
  const expected = { '--main-w': constant('MAIN_W'), '--side-w': constant('SIDE_W') };
  const seen = { '--main-w': 0, '--side-w': 0 };
  for (const file of rendererCssFiles()) {
    for (const rule of readCss(file).rules) {
      for (const d of rule.declarations) {
        if (!(d.prop in expected)) continue;
        seen[d.prop]++;
        assert.equal(d.value, expected[d.prop], `${relative(file)}:${rule.line} ${d.prop}`);
      }
    }
  }
  assert.ok(seen['--main-w'] > 0 && seen['--side-w'] > 0, 'no --main-w/--side-w declaration found');
});
