// Shared handles: the preload bridge, DOM helper, platform flags, toolbar icons and the session button.

const { icon } = window.ICONS;
const onscreenly = window.onscreenly;
const $ = (s) => document.querySelector(s);
const isWindows = onscreenly.platform === 'win32';
const isMac = onscreenly.platform === 'darwin';

// Exiting must work before settings or provider setup has completed.
const quitButton = $('#quit-btn');
const clearIC = document.querySelector('#clear-transcript-btn .ic');

function setSessionButton(active) {
  const btn = $('#stop-btn');
  const ic = btn.querySelector('.ic');
  const label = btn.querySelector('.tb-stop-label');
  btn.classList.toggle('active', active);
  if (ic) ic.innerHTML = active ? icon('square', { size: 14 }) : icon('play', { size: 14, filled: false });
  if (label) label.textContent = active ? 'End session' : 'Start session';
  const title = active ? 'End session' : 'Start session';
  btn.title = title;
  btn.setAttribute('aria-label', title);
}

export function init() {
  quitButton.addEventListener('click', () => onscreenly.quit());
  quitButton.title = isMac ? 'Quit Onscreenly (⌘⇧X)' : 'Quit Onscreenly (Ctrl+Shift+X)';

  // ---- paint icons -------------------------------------------------------
  $('#logo-btn').innerHTML = icon('badge-question-mark', { size: 16 });
  $('#tb-settings-btn').innerHTML = icon('settings', { size: 16 });
  $('.tb-hide .chev').innerHTML = icon('chevron-down', { size: 14 });
  $('#opacity-btn .ic').innerHTML = icon('eclipse', { size: 14 });
  $('#quit-btn').innerHTML = icon('x', { size: 14 });
  document.querySelector('.act[data-mode="assist"] .ic').innerHTML = icon('monitor', { size: 16 });
  document.querySelector('.act[data-mode="say"] .ic').innerHTML = icon('wand-sparkles', { size: 16 });
  document.querySelector('.act[data-mode="recap"] .ic').innerHTML = icon('refresh-cw', { size: 16 });
  $('#smart-toggle .ic').innerHTML = icon('zap', { size: 14 });
  $('#more-btn').innerHTML = icon('more-horizontal', { size: 18 });
  $('#send-btn').innerHTML = icon('play', { size: 15 });
  if (clearIC) clearIC.innerHTML = icon('trash-2', { size: 15 });
  setSessionButton(false);
}

export { $, icon, isMac, isWindows, onscreenly, setSessionButton };
