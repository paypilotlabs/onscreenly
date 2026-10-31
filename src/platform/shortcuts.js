// @ts-check
// Configurable global shortcuts. Kept dependency-free so it is unit-testable.
// Accelerator strings follow Electron's format, e.g. 'CommandOrControl+Return'.

// Global shortcuts work in every app while Onscreenly runs, so the defaults avoid combinations other
// apps rely on: ⌘↵ sends in Slack/Teams and runs a cell in Jupyter, and ⌘H is macOS's Hide.
const DEFAULTS = {
  say: 'CommandOrControl+Alt+Return',
  assist: 'CommandOrControl+Shift+Return',
  leetcode: 'CommandOrControl+Alt+K',
  // Add screen: keeps the visible part of a coding problem too long for one screen; the solve sends
  // every part. Solve's keys plus Shift. Not Ctrl+Alt+<letter> alone: on Windows that is AltGr+<letter>,
  // which types characters such as ą on many layouts.
  leetcodeAdd: 'CommandOrControl+Alt+Shift+K',
  hide: 'CommandOrControl+Shift+/',
  listening: 'CommandOrControl+Shift+L',
  quit: 'CommandOrControl+Shift+X'
};

// Every action that maps to a shortcut. Values = defaults; overrides from settings win when valid.
function resolveShortcuts(overrides = {}) {
  const out = {};
  for (const [action, def] of Object.entries(DEFAULTS)) {
    const v =
      overrides && typeof overrides[action] === 'string' && isValid(overrides[action]) ? overrides[action] : def;
    out[action] = v;
  }
  return out;
}

// Detect collisions between configured accelerators (a global shortcut can only be
// registered once). Returns an array of [actionA, actionB, accelerator] pairs.
function findConflicts(map) {
  const seen = new Map();
  const conflicts = [];
  for (const [action, accel] of Object.entries(map)) {
    if (!accel) continue;
    const key = accel.trim().toLowerCase();
    if (seen.has(key)) conflicts.push([seen.get(key), action, accel]);
    else seen.set(key, action);
  }
  return conflicts;
}

// Basic validity check: must contain at least a non-modifier key and plausible modifiers.
function isValid(accel) {
  if (!accel || typeof accel !== 'string') return false;
  const parts = accel.split('+').map((s) => s.trim());
  if (parts.some((p) => !p)) return false;
  const modifiers = new Set([
    'CommandOrControl',
    'CmdOrCtrl',
    'Command',
    'Cmd',
    'Control',
    'Ctrl',
    'Alt',
    'Option',
    'AltGr',
    'Shift',
    'Super',
    'Meta'
  ]);
  const keys = parts.filter((p) => !modifiers.has(p));
  return keys.length >= 1;
}

// An accelerator as the user reads it: '⌘⌥⇧K' on macOS, 'Ctrl+Alt+Shift+K' elsewhere.
function displayAccelerator(accel, platform = process.platform) {
  if (!accel || typeof accel !== 'string') return '';
  const mac = platform === 'darwin';
  const names = mac
    ? {
        CommandOrControl: '⌘',
        CmdOrCtrl: '⌘',
        Command: '⌘',
        Cmd: '⌘',
        Control: '⌃',
        Ctrl: '⌃',
        Alt: '⌥',
        Option: '⌥',
        Shift: '⇧',
        Return: '↵',
        Enter: '↵'
      }
    : {
        CommandOrControl: 'Ctrl',
        CmdOrCtrl: 'Ctrl',
        Control: 'Ctrl',
        Command: 'Ctrl',
        Cmd: 'Ctrl',
        Option: 'Alt',
        Return: 'Enter'
      };
  return accel
    .split('+')
    .map((p) => names[p] || p)
    .join(mac ? '' : '+');
}

module.exports = { DEFAULTS, resolveShortcuts, findConflicts, isValid, displayAccelerator };
