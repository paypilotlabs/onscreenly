// App-link consent dialog.
import { $, onscreenly } from './core.js';
import { setIgnore } from './window-behaviour.js';

// ---- assistant access request ------------------------------------------
// Shown here rather than as a native dialog because Onscreenly hides its dock icon:
// an OS panel from an accessory app never comes forward and cannot be
// clicked. Note the scrim is registered in the click-through selector above
// and in styles.css — without both, this window stays transparent to the
// mouse and the buttons do nothing.
const consentScrim = $('#consent-scrim');
let pendingConsentId = null;

function answerConsent(allowed) {
  if (!pendingConsentId) return;
  onscreenly.appLinkConsentRespond(pendingConsentId, allowed);
  pendingConsentId = null;
  consentScrim.classList.add('hidden');
}

export function init() {
  onscreenly.on('applink:consent-request', (request) => {
    pendingConsentId = request.id;
    $('#cs-title').textContent = request.message;
    $('#cs-body').textContent = request.detail;
    $('#cs-allow').textContent = request.allowLabel;
    consentScrim.classList.remove('hidden');
    // Do not wait for a mousemove to turn the mouse back on: the pointer may
    // already be still, and the sheet would be unclickable until it moved.
    setIgnore(false);
    $('#cs-deny').focus();
  });

  $('#cs-allow').addEventListener('click', () => answerConsent(true));
  $('#cs-deny').addEventListener('click', () => answerConsent(false));
  // Anything other than a deliberate Allow is a no, including Escape and
  // clicking away.
  consentScrim.addEventListener('click', (e) => {
    if (e.target === consentScrim) answerConsent(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && pendingConsentId) {
      e.preventDefault();
      answerConsent(false);
    }
  });
}
