// The publik API block in Settings and its low-starter notice.
import { state } from './state.js';
import { $, onscreenly } from './core.js';
import { showStatus } from './events.js';
import { statusText } from './settings-form.js';
import { showPublikCard, showPublikDisclosure } from './onboarding.js';

// ---- publik API (packaged-build default) --------------------------------
function publikActionButton(action) {
  if (!action || !action.kind) return null;
  const btn = document.createElement('button');
  if (action.kind === 'link' && action.url) {
    btn.textContent = action.label || 'Open publikhq.com';
    btn.addEventListener('click', () => onscreenly.publikOpen(action.url));
  } else if (action.kind === 'reconnect') {
    btn.textContent = action.label || 'Reconnect';
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      state.publikState = await onscreenly.publikReconnect();
      renderPublikBlock();
    });
  } else if (action.kind === 'disclosure') {
    btn.textContent = 'Set up publik API';
    btn.addEventListener('click', () => showPublikDisclosure());
  } else if (action.kind === 'card') {
    btn.textContent = 'Show the publik API card';
    btn.addEventListener('click', () => showPublikCard());
  } else {
    return null;
  }
  return btn;
}

// Low starter (CONTRACT §12 / task 3): one non-blocking banner with one
// link, once per key while it sits below the 20% line — not on every push.
let lowStarterNoticedFor = null;
function maybeShowLowStarter(p) {
  if (!p || !p.lowStarter) {
    lowStarterNoticedFor = null;
    return;
  }
  if (lowStarterNoticedFor === p.keyId) return;
  lowStarterNoticedFor = p.keyId;
  showStatus(p.lowStarter.message, publikActionButton(p.lowStarter.action));
}

function selectByoProvider() {
  const openaiBtn = document.querySelector('#provider-seg button[data-provider="openai"]');
  if (openaiBtn) openaiBtn.click();
  $('#key-openai').focus();
}

function renderPublikBlock() {
  const p = state.publikState;
  const block = $('#publik-settings');
  if (!block || !p || !state.settings) return;
  const show = (id, on) => $(id).classList.toggle('hidden', !on);
  $('#publik-cost-note').textContent = p.copy.cost;
  $('#publik-data-note').textContent = p.copy.dataPath;
  const note = $('#publik-status-note');
  note.classList.remove('warn');
  let line;
  if (p.connected && p.revoked) {
    line = 'publik API key was revoked. Reconnect to set this computer up again.';
    note.classList.add('warn');
  } else if (p.connected) {
    line = `Connected · key ${p.keyId} · ${p.line || 'Ready'}`;
  } else if (p.disconnected) {
    line = 'publik API is disconnected. This computer was removed from your publik account.';
    note.classList.add('warn');
  } else if (!p.disclosureAccepted) {
    line = 'Not set up yet — no key needed to set it up.';
  } else if (p.lastError) {
    line = p.lastError;
    note.classList.add('warn');
  } else {
    line = 'Connecting…';
  }
  note.textContent = line;
  // Low starter: the same sentence the banner used, kept on the card.
  const low = $('#publik-low-note');
  low.textContent = p.lowStarter ? p.lowStarter.message : '';
  low.classList.toggle('hidden', !p.lowStarter);
  // "Why it costs money" — the one justification sentence (CONTRACT §12).
  $('#publik-why-summary').textContent = p.copy.whyItCostsToggle;
  $('#publik-why-text').textContent = p.copy.whyItCosts;
  // The primary button (CONTRACT §12.2): "Link this computer & pick a plan"
  // while anonymous, "Pick a plan" / "Manage plan" once claimed.
  const cta = p.settingsCta;
  $('#publik-link').textContent = cta ? cta.label : '';
  show('#publik-setup', !p.connected && !p.disclosureAccepted);
  show('#publik-reconnect', p.disclosureAccepted && (!p.connected || p.revoked));
  show('#publik-link', !!cta);
  show('#publik-add-credit', p.connected && !p.revoked && p.claimState === 'claimed' && !!p.addCreditUrl);
  show('#publik-disconnect', p.connected && !p.revoked);
  if (state.settings.provider === 'publik') $('#s-status').textContent = statusText();
}

export function init() {
  $('#publik-setup').addEventListener('click', () => showPublikDisclosure());
  $('#publik-link').addEventListener('click', () => {
    const cta = state.publikState && state.publikState.settingsCta;
    if (cta) onscreenly.publikOpen(cta.url);
  });
  $('#publik-add-credit').addEventListener('click', () =>
    onscreenly.publikOpen(state.publikState && state.publikState.addCreditUrl)
  );
  $('#publik-pricing').addEventListener('click', () =>
    onscreenly.publikOpen(state.publikState ? state.publikState.links.pricing : '')
  );
  $('#publik-reconnect').addEventListener('click', async () => {
    $('#publik-reconnect').disabled = true;
    try {
      state.publikState = await onscreenly.publikReconnect();
    } finally {
      $('#publik-reconnect').disabled = false;
    }
    renderPublikBlock();
  });
  $('#publik-disconnect').addEventListener('click', async () => {
    state.publikState = await onscreenly.publikDisconnect();
    renderPublikBlock();
  });
  $('#publik-byo').addEventListener('click', selectByoProvider);
  onscreenly.on('publik:state', (next) => {
    state.publikState = next;
    renderPublikBlock();
    maybeShowLowStarter(next);
  });
}

export { publikActionButton, renderPublikBlock, selectByoProvider };
