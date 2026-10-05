// Window behaviour: global keys, scroll lock, click-through and dragging.
import { $, onscreenly } from './core.js';
import { closeSettings, openSettings, scrim } from './settings-panel.js';

// ---- click-through: only the UI blocks the mouse; empty gaps pass to your screen ----
let ignoring = null;
let draggingWindow = false;
function setIgnore(v) {
  if (v !== ignoring) {
    ignoring = v;
    onscreenly.setIgnoreMouse(v);
  }
}

// ---- window drag: press anywhere on the toolbar that isn't a control ----
const toolbar = $('#toolbar');

export function init() {
  // ---- global keys -------------------------------------------------------
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !scrim.classList.contains('hidden')) void closeSettings();
    if ((e.metaKey || e.ctrlKey) && e.key === ',') {
      e.preventDefault();
      openSettings();
    }
  });

  // Safety net for the same class of bug: html/body are overflow:hidden, so any
  // stray programmatic scroll of the document is invisible to the user and
  // unrecoverable by mouse. Snap it back so the toolbar cannot be stranded.
  window.addEventListener(
    'scroll',
    () => {
      if (window.scrollY || window.scrollX) window.scrollTo(0, 0);
    },
    { passive: true }
  );
  document.addEventListener('mousemove', (e) => {
    // The window trails the cursor while dragging; going click-through then would drop the release.
    if (draggingWindow) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const overUI = !!(
      el &&
      el.closest &&
      el.closest('#toolbar, #panel-wrap, #transcript-sidebar, #settings-scrim, #onboard-scrim, #consent-scrim')
    );
    setIgnore(!overUI);
  });
  setIgnore(true);
  toolbar.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('button, input, .tb-opacity-wrap')) return;
    e.preventDefault();
    toolbar.setPointerCapture(e.pointerId);
    draggingWindow = true;
    setIgnore(false);
    toolbar.classList.add('dragging');
    onscreenly.windowDragStart();
  });
  // Fires on release, cancel, or anything else that ends the press.
  toolbar.addEventListener('lostpointercapture', () => {
    if (!draggingWindow) return;
    draggingWindow = false;
    toolbar.classList.remove('dragging');
    onscreenly.windowDragEnd();
  });
}

export { setIgnore };
