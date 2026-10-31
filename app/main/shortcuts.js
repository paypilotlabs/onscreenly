// Global keyboard shortcuts: the defaults in src/platform/shortcuts.js, changed by the user in
// Settings › Appearance (shortcuts:set). Only the accelerators Onscreenly registered are ever
// unregistered, so other apps' shortcuts are left alone.
const { app, globalShortcut } = require('electron');
const store = require('../../src/storage/store');
const { recordEvent } = require('../../src/integrations/applink');
const { DEFAULTS, resolveShortcuts, findConflicts, isValid } = require('../../src/platform/shortcuts');
const { handle } = require('./ipc-guard');
const { session, send } = require('./session');
const { runFeature, addProblemScreen } = require('./llm-runner');

const ACTIONS = {
  say: () => runFeature('say', ''),
  assist: () => runFeature('assist', ''),
  leetcode: () => runFeature('leetcode', ''),
  leetcodeAdd: () => addProblemScreen(),
  hide: () => send('hide:toggle', {}),
  // Start or end a session: the renderer runs the same toggle as the session button.
  listening: () => send('session:toggle', {}),
  quit: () => app.quit()
};

let registered = {}; // action -> accelerator Onscreenly holds right now

function currentMap() {
  return resolveShortcuts(store.getSettings().shortcuts || {});
}

function registerShortcuts() {
  const { shortcutState } = session;
  for (const accelerator of Object.values(registered)) globalShortcut.unregister(accelerator);
  registered = {};
  const map = currentMap();
  for (const [action, run] of Object.entries(ACTIONS)) {
    let ok = false;
    try {
      ok = globalShortcut.register(map[action], run);
    } catch (_) {
      ok = false; // an accelerator Electron cannot parse
    }
    shortcutState[action] = ok;
    if (ok) registered[action] = map[action];
    else {
      recordEvent({
        level: 'warn',
        event: 'shortcut_unavailable',
        msg: 'another application holds the ' + action + ' shortcut',
        frame: 'registerShortcuts',
        context: { shortcut: action }
      });
    }
  }
}

/** What Settings and the hints show: every action's keys, and which ones another app holds. */
function shortcutsInfo() {
  const map = currentMap();
  const unavailable = Object.keys(ACTIONS).filter((a) => !session.shortcutState[a]);
  return { map, defaults: { ...DEFAULTS }, unavailable };
}

// Saves the whole map (settings merge objects, so a partial map could never drop an override),
// re-registers and tells the window.
function save(map) {
  store.setSettings({ shortcuts: { ...map } });
  registerShortcuts();
  const info = shortcutsInfo();
  send('shortcuts:changed', info);
  return info;
}

function registerShortcutsIpc() {
  handle('shortcuts:get', () => shortcutsInfo());
  // { action, accelerator } changes one; { reset: true } goes back to the defaults.
  handle('shortcuts:set', (_e, request) => {
    if (request && request.reset === true) return { ok: true, ...save({ ...DEFAULTS }) };
    const action = request && request.action;
    const accelerator = request && request.accelerator;
    if (!Object.prototype.hasOwnProperty.call(ACTIONS, action)) throw new Error('Refused: unknown shortcut');
    // A global shortcut needs Cmd/Ctrl/Alt: a bare key or Shift+key would take that key from every app.
    const hasModifier =
      typeof accelerator === 'string' &&
      /(^|\+)(CommandOrControl|CmdOrCtrl|Command|Cmd|Control|Ctrl|Alt|Option|Super|Meta)\+/.test(accelerator);
    if (typeof accelerator !== 'string' || accelerator.length > 60 || !isValid(accelerator) || !hasModifier) {
      return { ok: false, error: 'Use at least one modifier key with another key.', ...shortcutsInfo() };
    }
    const previous = currentMap();
    const next = { ...previous, [action]: accelerator };
    const clash = findConflicts(next).find(([a, b]) => a === action || b === action);
    if (clash) {
      const other = clash[0] === action ? clash[1] : clash[0];
      return { ok: false, error: `Already used for ${other}.`, ...shortcutsInfo() };
    }
    const info = save(next);
    // Another app holds it: keep the old keys rather than leave the action without any.
    if (info.unavailable.includes(action)) {
      save(previous);
      return { ok: false, error: 'Another app already uses these keys.', ...shortcutsInfo() };
    }
    return { ok: true, ...info };
  });
}

module.exports = { registerShortcuts, registerShortcutsIpc, shortcutsInfo };
