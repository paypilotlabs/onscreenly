// Global keyboard shortcuts.
const { app, globalShortcut } = require('electron');
const { recordEvent } = require('../../src/integrations/applink');
const { DEFAULTS } = require('../../src/platform/shortcuts');
const { session, send } = require('./session');
const { runFeature } = require('./llm-runner');

function registerShortcuts() {
  const { shortcutState } = session;
  shortcutState.say = globalShortcut.register('CommandOrControl+Return', () => runFeature('say', ''));
  shortcutState.assist = globalShortcut.register('CommandOrControl+Shift+Return', () => runFeature('assist', ''));
  shortcutState.leetcode = globalShortcut.register('CommandOrControl+H', () => runFeature('leetcode', ''));
  shortcutState.hide = globalShortcut.register('CommandOrControl+Shift+/', () => send('hide:toggle', {}));
  // Start or end a session: the renderer runs the same toggle as the session button.
  shortcutState.listening = globalShortcut.register(DEFAULTS.listening, () => send('session:toggle', {}));
  shortcutState.quit = globalShortcut.register('CommandOrControl+Shift+X', () => app.quit());
  for (const [name, wasRegistered] of Object.entries(shortcutState)) {
    if (!wasRegistered) {
      recordEvent({
        level: 'warn',
        event: 'shortcut_unavailable',
        msg: 'another application holds the ' + name + ' shortcut',
        frame: 'registerShortcuts',
        context: { shortcut: name }
      });
    }
  }
}

module.exports = { registerShortcuts };
