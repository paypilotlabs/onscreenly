// App-link consent dialog.
import { $, onscreenly } from './core.js';
import { rememberOpener, restoreFocus, safeFocus } from './a11y.js';
import { setIgnore } from './window-behaviour.js';

// ---- assistant access request ------------------------------------------
// Shown here rather than as a native dialog because Onscreenly hides its dock icon:
// an OS panel from an accessory app never comes forward and cannot be
// clicked. Note the scrim is registered in the click-through selector above
// and in styles.css — without both, this window stays transparent to the
// mouse and the buttons do nothing.
const consentScrim = $('#consent-scrim');
const consent = $('#consent');
let pendingConsentId = null;

function answerConsent(allowed) {
  if (!pendingConsentId) return;
  onscreenly.appLinkConsentRespond(pendingConsentId, allowed);
  pendingConsentId = null;
  consentScrim.classList.add('hidden');
  restoreFocus(consent);
}

export function init() {
  onscreenly.on('applink:consent-request', (request) => {
    pendingConsentId = request.id;
    $('#cs-title').textContent = request.message;
    $('#cs-body').textContent = request.detail;
    $('#cs-allow').textContent = request.allowLabel;
    if (consentScrim.classList.contains('hidden')) rememberOpener(consent);
    consentScrim.classList.remove('hidden');
    // Do not wait for a mousemove to turn the mouse back on: the pointer may
    // already be still, and the sheet would be unclickable until it moved.
    setIgnore(false);
    // "Don't allow" takes focus first, so Enter alone never grants access.
    safeFocus($('#cs-deny'));
  });

  $('#cs-allow').addEventListener('click', () => answerConsent(true));
  $('#cs-deny').addEventListener('click', () => answerConsent(false));
  // Anything other than a deliberate Allow is a no, including Escape and
  // clicking away. Consent is the top layer, so its Escape runs in the capture
  // phase and stops there: one press answers it and closes nothing beneath.
  consentScrim.addEventListener('click', (e) => {
    if (e.target === consentScrim) answerConsent(false);
  });
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape' && pendingConsentId) {
        e.preventDefault();
        e.stopPropagation();
        answerConsent(false);
      }
    },
    true
  );
}
