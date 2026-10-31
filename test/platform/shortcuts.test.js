const test = require('node:test');
const assert = require('node:assert');
const Module = require('node:module');
const path = require('node:path');
const { DEFAULTS, resolveShortcuts, findConflicts, isValid } = require('../../src/platform/shortcuts');

const ROOT = path.join(__dirname, '..', '..');

// Loads app/main/shortcuts.js with Electron's globalShortcut replaced by a recorder, and returns
// what it registered (accelerator and handler, in order) plus the session it reports to.
function registeredShortcuts({ taken = [] } = {}) {
  const stub = (id, exports) => {
    const file = require.resolve(id, { paths: [ROOT] });
    const mod = new Module(file);
    mod.filename = file;
    mod.exports = exports;
    mod.loaded = true;
    require.cache[file] = mod;
  };
  let registered = [];
  let settings = { shortcuts: {} };
  const handlers = {};
  stub('electron', {
    app: { quit: () => {} },
    globalShortcut: {
      register: (accelerator, handler) => {
        if (taken.includes(accelerator)) return false; // another app holds it
        registered.push({ accelerator, handler });
        return true;
      },
      unregister: (accelerator) => {
        registered = registered.filter((r) => r.accelerator !== accelerator);
      }
    }
  });
  stub('./src/integrations/applink.js', { recordEvent: () => {} });
  stub('./app/main/llm-runner.js', { runFeature: () => {} });
  stub('./src/storage/store.js', {
    getSettings: () => settings,
    setSettings: (patch) => {
      settings = { ...settings, ...patch };
      return settings;
    }
  });
  stub('./app/main/ipc-guard.js', { handle: (channel, fn) => (handlers[channel] = fn) });
  delete require.cache[require.resolve('../../app/main/shortcuts')];
  const { registerShortcuts, registerShortcutsIpc } = require('../../app/main/shortcuts');
  const { session, setSender } = require('../../app/main/session');
  registerShortcuts();
  registerShortcutsIpc();
  const set = (request) => handlers['shortcuts:set'](null, request);
  return { registered: () => registered, session, setSender, set, settings: () => settings };
}

test('defaults cover the core actions without taking keys other apps rely on', () => {
  assert.strictEqual(DEFAULTS.say, 'CommandOrControl+Alt+Return');
  assert.strictEqual(DEFAULTS.assist, 'CommandOrControl+Shift+Return');
  // ⌘↵ sends in Slack/Teams and runs a Jupyter cell; ⌘H is macOS's Hide.
  for (const taken of ['CommandOrControl+Return', 'CommandOrControl+H']) {
    assert.ok(!Object.values(DEFAULTS).includes(taken), taken);
  }
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
  const accelerators = registered().map((r) => r.accelerator);
  assert.ok(accelerators.every(isValid), accelerators.join(', '));
  assert.deepStrictEqual(findConflicts(Object.fromEntries(accelerators.map((a, i) => [String(i), a]))), []);

  const listening = registered().find((r) => r.accelerator === DEFAULTS.listening);
  assert.ok(listening, `${DEFAULTS.listening} is registered`);
  assert.strictEqual(session.shortcutState.listening, true);
  const sent = [];
  setSender((channel) => sent.push(channel));
  listening.handler();
  assert.deepStrictEqual(sent, ['session:toggle']);
});

test('a changed shortcut replaces the old one, is saved, and a reset brings the defaults back', () => {
  const { registered, set, settings } = registeredShortcuts();
  const result = set({ action: 'leetcode', accelerator: 'CommandOrControl+Alt+J' });
  assert.strictEqual(result.ok, true);
  const accelerators = registered().map((r) => r.accelerator);
  assert.ok(accelerators.includes('CommandOrControl+Alt+J'));
  assert.ok(!accelerators.includes(DEFAULTS.leetcode), 'the old keys are released');
  assert.strictEqual(settings().shortcuts.leetcode, 'CommandOrControl+Alt+J');
  const reset = set({ reset: true });
  assert.strictEqual(reset.map.leetcode, DEFAULTS.leetcode);
  assert.ok(registered().some((r) => r.accelerator === DEFAULTS.leetcode));
});

test('a shortcut that is invalid, already used, or held by another app is refused and nothing changes', () => {
  const { registered, set } = registeredShortcuts({ taken: ['CommandOrControl+Alt+T'] });
  // A bare key, or Shift with a key, would take that key from every app.
  assert.strictEqual(set({ action: 'say', accelerator: 'K' }).ok, false);
  assert.strictEqual(set({ action: 'say', accelerator: 'Shift+K' }).ok, false);
  const dup = set({ action: 'say', accelerator: DEFAULTS.assist });
  assert.strictEqual(dup.ok, false);
  assert.match(dup.error, /Already used for assist/);
  const held = set({ action: 'say', accelerator: 'CommandOrControl+Alt+T' });
  assert.strictEqual(held.ok, false);
  assert.match(held.error, /Another app/);
  assert.ok(
    registered().some((r) => r.accelerator === DEFAULTS.say),
    'the previous keys still work'
  );
  assert.throws(() => set({ action: 'format-disk', accelerator: 'CommandOrControl+Alt+F' }), /unknown shortcut/);
});
