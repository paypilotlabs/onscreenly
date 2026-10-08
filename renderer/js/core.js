// Shared handles: the preload bridge, DOM helper, platform flags, shortcuts as text and the session button.

const onscreenly = window.onscreenly;
const $ = (s) => document.querySelector(s);
const isWindows = onscreenly.platform === 'win32';
const isMac = onscreenly.platform === 'darwin';

// Exiting must work before settings or provider setup has completed.
const quitButton = $('#quit-btn');

// ---- shortcuts as text ---------------------------------------------------
// The UI has no icons: keys are text. macOS shows its symbols (⌘ ⇧ ↵), Windows and Linux the words.
const KEY_NAMES = { mod: ['⌘', 'Ctrl'], shift: ['⇧', 'Shift'], '↵': ['↵', 'Enter'] };
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

// Hints ([data-combo]), keycap rows ([data-keys]), aria-keyshortcuts and the titles that name a
// shortcut. The markup is written for macOS; this repaints it for the platform.
function paintShortcuts() {
  document.querySelectorAll('[data-combo]').forEach((el) => {
    el.textContent = combo(...el.dataset.combo.split(' '));
  });
  document.querySelectorAll('[data-keys]').forEach((el) => {
    el.innerHTML = kbd(...el.dataset.keys.split(' '));
  });
  if (!isMac) {
    document.querySelectorAll('[aria-keyshortcuts]').forEach((el) => {
      el.setAttribute('aria-keyshortcuts', el.getAttribute('aria-keyshortcuts').replace(/\bMeta\b/g, 'Control'));
    });
  }
  $('.act[data-mode="say"]').title = `Suggests what to say next based on the conversation (${combo('mod', '↵')})`;
  $('.act[data-mode="assist"]').title =
    `Scans your screen and conversation to decide what you need (${combo('mod', 'shift', '↵')})`;
  $('#hide-btn').title = `Hide (${combo('mod', 'shift', '/')})`;
  quitButton.title = `Quit Onscreenly (${combo('mod', 'shift', 'X')})`;
}

// ---- session button ----------------------------------------------------
// "Start session" / "End session", with the live dot beside the label while a session runs.
function setSessionButton(active) {
  const btn = $('#stop-btn');
  const text = active ? 'End session' : 'Start session';
  btn.classList.toggle('active', active);
  btn.querySelector('.tb-stop-label').textContent = text;
  btn.title = `${text} (${combo('mod', 'shift', 'L')})`;
  btn.setAttribute('aria-label', text);
  // The empty state follows the session: "Ready when you are" or "Listening".
  $('#panel').dataset.capture = active ? 'on' : 'off';
}

export function init() {
  quitButton.addEventListener('click', () => onscreenly.quit());
  paintShortcuts();
  setSessionButton(false);
}

export { $, combo, isMac, isWindows, kbd, keyText, modKey, onscreenly, setSessionButton };
