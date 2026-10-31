// Shared handles: the preload bridge, DOM helper, platform flags, shortcuts as text and the session button.

const onscreenly = window.onscreenly;
const $ = (s) => document.querySelector(s);
const isWindows = onscreenly.platform === 'win32';
const isMac = onscreenly.platform === 'darwin';

// Exiting must work before settings or provider setup has completed.
const quitButton = $('#quit-btn');

// ---- shortcuts as text ---------------------------------------------------
// The UI has no icons: keys are text. macOS shows its symbols (⌘ ⇧ ↵), Windows and Linux the words.
const KEY_NAMES = {
  mod: ['⌘', 'Ctrl'],
  shift: ['⇧', 'Shift'],
  alt: ['⌥', 'Alt'],
  ctrl: ['⌃', 'Ctrl'],
  '↵': ['↵', 'Enter']
};
const modKey = isMac ? '⌘' : 'Ctrl';

function keyText(key) {
  const names = KEY_NAMES[key];
  return names ? names[isMac ? 0 : 1] : key;
}

/** A shortcut as one run of text, for hints and titles: ⌘⇧L on macOS, Ctrl+Shift+L elsewhere. */
function combo(...keys) {
  return keys.map(keyText).join(isMac ? '' : '+');
}

const escapeText = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Keycap markup for a shortcut, one shared .kbd per key. The macOS symbols take .kbd-sym: the
 * monospace stack has no ⌘ ⇧ ↵ of its own, so those caps use the sans stack instead.
 */
function kbd(...keys) {
  return keys
    .map((key) => {
      const text = keyText(key);
      return `<kbd class="kbd${/^[⌘⇧↵]$/.test(text) ? ' kbd-sym' : ''}">${escapeText(text)}</kbd>`;
    })
    .join('');
}

// The global shortcuts, as main registered them (shortcuts:get / shortcuts:changed). Until main
// answers, the defaults from src/platform/shortcuts.js.
const SHORTCUT_DEFAULTS = {
  say: 'CommandOrControl+Alt+Return',
  assist: 'CommandOrControl+Shift+Return',
  leetcode: 'CommandOrControl+Alt+K',
  leetcodeAdd: 'CommandOrControl+Alt+Shift+K',
  hide: 'CommandOrControl+Shift+/',
  listening: 'CommandOrControl+Shift+L',
  quit: 'CommandOrControl+Shift+X'
};
let shortcutMap = { ...SHORTCUT_DEFAULTS };
const ACCELERATOR_KEYS = {
  CommandOrControl: 'mod',
  CmdOrCtrl: 'mod',
  Command: 'mod',
  Cmd: 'mod',
  Meta: 'mod',
  Super: 'mod',
  Control: 'ctrl',
  Ctrl: 'ctrl',
  Shift: 'shift',
  Alt: 'alt',
  Option: 'alt',
  Return: '↵',
  Enter: '↵'
};

/** An Electron accelerator ('CommandOrControl+Alt+K') as keys for combo()/kbd(): ['mod', 'alt', 'K']. */
function acceleratorKeys(accelerator) {
  return String(accelerator || '')
    .split('+')
    .filter(Boolean)
    .map((part) => ACCELERATOR_KEYS[part] || part);
}

/** The keys of one global shortcut: say, assist, leetcode, leetcodeAdd, hide, listening or quit. */
function shortcutKeys(action) {
  return acceleratorKeys(shortcutMap[action]);
}

function setShortcutMap(map) {
  shortcutMap = { ...SHORTCUT_DEFAULTS, ...(map || {}) };
  paintShortcuts();
}

// aria-keyshortcuts wants DOM key names: Meta on macOS and Control elsewhere for the command key.
function ariaShortcut(action) {
  const names = { mod: isMac ? 'Meta' : 'Control', ctrl: 'Control', shift: 'Shift', alt: 'Alt', '↵': 'Enter' };
  return shortcutKeys(action)
    .map((k) => names[k] || k)
    .join('+');
}

// Hints ([data-combo] for keys inside the window, [data-shortcut] / [data-shortcut-keys] for the
// global shortcuts), aria-keyshortcuts and the titles that name a shortcut. The markup is written
// for macOS; this repaints it for the platform and for the user's own shortcuts.
function paintShortcuts() {
  document.querySelectorAll('[data-combo]').forEach((el) => {
    el.textContent = combo(...el.dataset.combo.split(' '));
  });
  document.querySelectorAll('[data-keys]').forEach((el) => {
    el.innerHTML = kbd(...el.dataset.keys.split(' '));
  });
  document.querySelectorAll('[data-shortcut]').forEach((el) => {
    el.textContent = combo(...shortcutKeys(el.dataset.shortcut));
  });
  document.querySelectorAll('[data-shortcut-keys]').forEach((el) => {
    el.innerHTML = kbd(...shortcutKeys(el.dataset.shortcutKeys));
  });
  $('#stop-btn').setAttribute('aria-keyshortcuts', ariaShortcut('listening'));
  $('#hide-btn').setAttribute('aria-keyshortcuts', ariaShortcut('hide'));
  $('.act[data-mode="say"]').title =
    `Suggests what to say next based on the conversation (${combo(...shortcutKeys('say'))})`;
  $('.act[data-mode="assist"]').title =
    `Scans your screen and conversation to decide what you need (${combo(...shortcutKeys('assist'))})`;
  const hideBtn = $('#hide-btn');
  hideBtn.title = `${hideBtn.querySelector('.tb-hide-label').textContent} (${combo(...shortcutKeys('hide'))})`;
  quitButton.title = `Quit Onscreenly (${combo(...shortcutKeys('quit'))})`;
  const stop = $('#stop-btn');
  if (!stop.classList.contains('is-pending')) {
    stop.title = `${stop.querySelector('.tb-stop-label').textContent} (${combo(...shortcutKeys('listening'))})`;
  }
}

// ---- buttons -------------------------------------------------------------
// A button's look is one of the shared kinds (primary, secondary, ghost, danger). A view has at most
// one primary, so some buttons change kind with the state they are in.
function setButtonKind(el, kind) {
  el.classList.remove('btn-primary', 'btn-secondary', 'btn-ghost', 'btn-danger');
  el.classList.add('btn', `btn-${kind}`);
}

// ---- session button ----------------------------------------------------
// "Start session" / "End session", with the live dot beside the label while a session runs, and a
// spinner with "Starting…" while one starts.
function setSessionButton(active, pending = false) {
  const btn = $('#stop-btn');
  const text = pending ? 'Starting…' : active ? 'End session' : 'Start session';
  btn.classList.toggle('active', active && !pending);
  btn.classList.toggle('is-pending', pending);
  if (pending) btn.setAttribute('aria-busy', 'true');
  else btn.removeAttribute('aria-busy');
  btn.querySelector('.tb-stop-label').textContent = text;
  btn.title = pending ? text : `${text} (${combo(...shortcutKeys('listening'))})`;
  btn.setAttribute('aria-label', text);
  // The empty state follows the session: "Ready when you are", or "Listening" once one runs. A
  // session that nothing can transcribe is 'no-stt' (set with the speech status, transcript.js).
  const panel = $('#panel');
  if (!active && !pending) panel.dataset.capture = 'off';
  else if (panel.dataset.capture === 'off') panel.dataset.capture = 'on';
}

export function init() {
  quitButton.addEventListener('click', () => onscreenly.quit());
  paintShortcuts();
  setSessionButton(false);
}

export {
  $,
  acceleratorKeys,
  combo,
  isMac,
  isWindows,
  kbd,
  keyText,
  modKey,
  onscreenly,
  setButtonKind,
  setSessionButton,
  setShortcutMap,
  shortcutKeys
};
