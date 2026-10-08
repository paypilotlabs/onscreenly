// Keyboard focus for the dialogs: focus moves only while this window has it, Tab stays inside the
// topmost open dialog, and a dialog that closes gives focus back to whatever opened it.

// Topmost first: consent opens over onboarding, which opens over Settings.
const DIALOGS = [
  ['#consent-scrim', '#consent'],
  ['#onboard-scrim', '#onboard'],
  ['#settings-scrim', '#settings']
];

const FOCUSABLE = 'button, [href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])';

/**
 * Focuses `el`, but only while this window has focus. The overlay floats over other apps, so a dialog
 * that opens by itself (onboarding at launch, a consent request) must not take their keyboard.
 */
function safeFocus(el) {
  if (el && document.hasFocus()) el.focus({ preventScroll: true });
}

const isShown = (el) => !!el && !el.classList.contains('hidden');

/** The open dialog nearest the top, or null when none is open. */
function topDialog() {
  for (const [scrim, dialog] of DIALOGS) {
    if (isShown(document.querySelector(scrim))) return document.querySelector(dialog);
  }
  return null;
}

// What Tab can reach: enabled, rendered, and not inside a closed <details>.
function canFocus(el) {
  return (
    !el.disabled &&
    el.tabIndex !== -1 &&
    el.getClientRects().length > 0 &&
    getComputedStyle(el).visibility !== 'hidden' &&
    !el.closest('details:not([open]) > :not(summary)')
  );
}

function focusables(root) {
  return Array.from(root.querySelectorAll(FOCUSABLE)).filter(canFocus);
}

// ---- focus return ---------------------------------------------------------
// Each dialog remembers the control that had focus when it opened and hands focus back to it when
// it closes, if that control can still take it and no other dialog now covers it.
const openers = new Map();

function rememberOpener(dialog) {
  const active = document.activeElement;
  openers.set(dialog, active && active !== document.body && !dialog.contains(active) ? active : null);
}

function restoreFocus(dialog) {
  const opener = openers.get(dialog);
  openers.delete(dialog);
  if (!opener || !opener.isConnected || !canFocus(opener)) return;
  const top = topDialog();
  if (!top || top.contains(opener)) safeFocus(opener);
}

export function init() {
  // Tab and Shift+Tab cycle inside the topmost dialog. Focus that is still on the overlay under the
  // scrim moves into the dialog on the first press.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const dialog = topDialog();
    if (!dialog) return;
    const list = focusables(dialog);
    if (!list.length) return;
    const first = list[0];
    const last = list[list.length - 1];
    const active = document.activeElement;
    if (!dialog.contains(active)) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    } else if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  });
}

export { rememberOpener, restoreFocus, safeFocus };
