// Settings › Appearance › Keyboard shortcuts: change a global shortcut by clicking it and pressing
// the new keys. Main checks and registers them (shortcuts:set) and repaints every hint through
// shortcuts:changed.
import { $, acceleratorKeys, combo, onscreenly, setShortcutMap } from './core.js';

const LABELS = [
  ['listening', 'Start or end a session'],
  ['say', 'What should I say?'],
  ['assist', 'Assist'],
  ['leetcode', 'Solve the coding problem on screen'],
  ['hide', 'Hide or show'],
  ['quit', 'Quit']
];
const HELP = 'Click a shortcut, then press the new keys. Esc cancels.';

let info = null;
let recording = null; // the action whose button is waiting for keys

// A keydown as an Electron accelerator, or null while only modifiers are held. At least one of
// Cmd/Ctrl/Alt is required: a global Shift+letter would take that letter from every app.
function acceleratorFrom(e) {
  const named = {
    Enter: 'Return',
    ' ': 'Space',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right'
  };
  if (['Meta', 'Control', 'Alt', 'Shift', 'CapsLock'].includes(e.key)) return null;
  let key = named[e.key] || (e.code && /^Key[A-Z]$/.test(e.code) ? e.code.slice(3) : e.key);
  if (e.code && /^Digit\d$/.test(e.code)) key = e.code.slice(5);
  if (key.length === 1) key = key.toUpperCase();
  const parts = [];
  if (e.metaKey || e.ctrlKey) parts.push('CommandOrControl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (!parts.some((p) => p !== 'Shift')) return '';
  return [...parts, key].join('+');
}

function note(text, warn = false) {
  const el = $('#shortcut-note');
  el.textContent = text;
  el.classList.toggle('warn', warn);
}

function render() {
  const rows = $('#shortcut-rows');
  rows.replaceChildren();
  for (const [action, label] of LABELS) {
    const row = document.createElement('div');
    row.className = 's-field';
    const name = document.createElement('label');
    name.textContent = label;
    name.htmlFor = `shortcut-${action}`;
    const button = document.createElement('button');
    button.type = 'button';
    button.id = `shortcut-${action}`;
    button.className = 'btn btn-secondary compact shortcut-key';
    button.dataset.action = action;
    const unavailable = info && info.unavailable.includes(action);
    button.textContent =
      recording === action
        ? 'Press keys…'
        : combo(...acceleratorKeys(info ? info.map[action] : '')) + (unavailable ? ' · in use by another app' : '');
    button.setAttribute('aria-pressed', String(recording === action));
    button.addEventListener('click', () => {
      recording = recording === action ? null : action;
      note(recording ? `Press the new keys for “${label}”. Esc cancels.` : HELP);
      render();
      if (recording) $(`#shortcut-${action}`).focus();
    });
    row.append(name, button);
    rows.append(row);
  }
}

function apply(next) {
  info = next;
  setShortcutMap(next.map);
  if ($('#shortcut-rows')) render();
}

async function refresh() {
  const next = await onscreenly.shortcutsGet().catch(() => null);
  if (next) apply(next);
}

export function init() {
  // While a shortcut is being recorded, every key goes to it: in the capture phase, before Settings
  // or the composer can act on Escape or Enter.
  document.addEventListener(
    'keydown',
    async (e) => {
      if (!recording) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        recording = null;
        note(HELP);
        render();
        return;
      }
      const accelerator = acceleratorFrom(e);
      if (accelerator === null) return; // still holding modifiers
      if (!accelerator) {
        note('Use Cmd/Ctrl or Alt with another key.', true);
        return;
      }
      const action = recording;
      recording = null;
      const result = await onscreenly.shortcutsSet({ action, accelerator }).catch((err) => ({
        ok: false,
        error: err && err.message
      }));
      if (result && result.map) apply(result);
      else render();
      note(
        result && result.ok ? 'Saved. It works in every app now.' : (result && result.error) || HELP,
        !(result && result.ok)
      );
    },
    true
  );
  $('#shortcut-reset').addEventListener('click', async () => {
    recording = null;
    const result = await onscreenly.shortcutsSet({ reset: true }).catch(() => null);
    if (result) apply(result);
    note('Back to the default shortcuts.');
  });
  onscreenly.on('shortcuts:changed', apply);
  refresh();
}
