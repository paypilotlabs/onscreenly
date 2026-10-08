const test = require('node:test');
const assert = require('node:assert');
const Module = require('node:module');
const path = require('node:path');
const { DEFAULTS, resolveShortcuts, findConflicts, isValid } = require('../../src/platform/shortcuts');

const ROOT = path.join(__dirname, '..', '..');

// Loads app/main/shortcuts.js with Electron's globalShortcut replaced by a recorder, and returns
// what it registered (accelerator and handler, in order) plus the session it reports to.
function registeredShortcuts() {
  const stub = (id, exports) => {
    const file = require.resolve(id, { paths: [ROOT] });
    const mod = new Module(file);
    mod.filename = file;
    mod.exports = exports;
    mod.loaded = true;
    require.cache[file] = mod;
  };
  const registered = [];
  stub('electron', {
    app: { quit: () => {} },
    globalShortcut: {
      register: (accelerator, handler) => {
        registered.push({ accelerator, handler });
        return true;
      }
    }
  });
  stub('./src/integrations/applink.js', { recordEvent: () => {} });
  stub('./app/main/llm-runner.js', { runFeature: () => {} });
  const { registerShortcuts } = require('../../app/main/shortcuts');
  const { session, setSender } = require('../../app/main/session');
  registerShortcuts();
  return { registered, session, setSender };
}

test('defaults cover the core actions', () => {
  assert.strictEqual(DEFAULTS.say, 'CommandOrControl+Return');
  assert.strictEqual(DEFAULTS.assist, 'CommandOrControl+Shift+Return');
  assert.strictEqual(DEFAULTS.listening, 'CommandOrControl+Shift+L');
  assert.ok(DEFAULTS.leetcode);
  assert.ok(DEFAULTS.quit);
});

test('resolveShortcuts merges overrides', () => {
  const map = resolveShortcuts({ leetcode: 'CommandOrControl+L' });
  assert.strictEqual(map.leetcode, 'CommandOrControl+L');
  assert.strictEqual(map.assist, DEFAULTS.assist);
});

test('findConflicts detects duplicate accelerators', () => {
  const map = resolveShortcuts({ leetcode: 'CommandOrControl+Shift+Return' });
  const conflicts = findConflicts(map);
  assert.ok(conflicts.some(([a, b]) => (a === 'assist' && b === 'leetcode') || (a === 'leetcode' && b === 'assist')));
});

test('no conflicts in the default set', () => {
  assert.strictEqual(findConflicts(resolveShortcuts()).length, 0);
});

test('isValid accepts good accelerators and rejects junk', () => {
  assert.ok(isValid('CommandOrControl+Return'));
  assert.ok(isValid('Shift+Q'));
  assert.ok(isValid('F1'));
  assert.strictEqual(isValid(''), false);
  assert.strictEqual(isValid('++'), false);
  assert.strictEqual(isValid(null), false);
});

test('the app registers ⌘⇧L / Ctrl+Shift+L to start or end a session, and no two shortcuts collide', () => {
  const { registered, session, setSender } = registeredShortcuts();
  const accelerators = registered.map((r) => r.accelerator);
  assert.ok(accelerators.every(isValid), accelerators.join(', '));
  assert.deepStrictEqual(findConflicts(Object.fromEntries(accelerators.map((a, i) => [String(i), a]))), []);

  const listening = registered.find((r) => r.accelerator === DEFAULTS.listening);
  assert.ok(listening, `${DEFAULTS.listening} is registered`);
  assert.strictEqual(session.shortcutState.listening, true);
  const sent = [];
  setSender((channel) => sent.push(channel));
  listening.handler();
  assert.deepStrictEqual(sent, ['session:toggle']);
});
