// -------- publik API --------
// Contract: ~/publik-api-research/CONTRACT.md. The key is minted only after
// the disclosure is accepted (publik:accept-disclosure); the balance line is
// fed by the x-publik-* headers on every answer and reconciled from GET /wallet.
const { app, shell } = require('electron');
const { handle, on } = require('./ipc-guard');
const os = require('os');
const store = require('../../src/storage/store');
const publik = require('../../src/integrations/publik');
const { recordEvent } = require('../../src/integrations/applink');
const { send } = require('./session');

// The app token release.yml baked into src/integrations/publik-build.json (empty in a dev
// checkout → the publik option is simply absent from the provider picker).
const publikBuild = publik.loadBuildConfig();

let publikWalletTimer = null;
let publikProvisioning = null;

function publikDevice() {
  let deviceName = '';
  try {
    deviceName = os.hostname();
  } catch {
    /* optional */
  }
  return {
    appVersion: app.getVersion(),
    platform: process.platform,
    osVersion: os.release(),
    arch: process.arch,
    deviceName
  };
}

function publikState() {
  const s = store.getSettings();
  const p = s.publik || {};
  const connected = !!s.apiKeys.publik;
  const wallet = p.wallet || null;
  const claimState = (wallet && wallet.claimState) || p.claimState || 'anonymous';
  const view = {
    available: publikBuild.available,
    selected: s.provider === publik.PUBLIK_PROVIDER,
    connected,
    revoked: !!p.revoked,
    disconnected: !!p.disconnected,
    keyId: p.keyId || '',
    claimState,
    claimUrl: p.claimUrl || (wallet && wallet.claimUrl) || '',
    addCreditUrl: (wallet && wallet.addCreditUrl) || '',
    topUpUrl: (wallet && wallet.topUpUrl) || p.claimUrl || '',
    starterMicros: p.starterMicros || 0,
    balanceMicros: p.balanceMicros,
    balanceAt: p.balanceAt || 0,
    balanceLabel: publik.formatMicros(p.balanceMicros),
    wallet,
    disclosureAccepted: p.disclosureAccepted || 0,
    disclosureVersion: publikBuild.disclosureVersion,
    lastError: p.lastError || '',
    cardShown: !!p.cardShown,
    copy: publik.COPY,
    links: publik.LINKS
  };
  view.line = publik.balanceLine(view);
  // CONTRACT §12: the first-run card (shown while connected && !cardShown),
  // the settings button, and the low-starter banner — all computed here so
  // the renderer only paints.
  view.card = publik.ctaView(view);
  view.settingsCta = publik.settingsCta(view);
  view.lowStarter = publik.lowStarterNotice(view);
  return view;
}
function publikPush() {
  send('publik:state', publikState());
}

async function publikProvision() {
  if (publikProvisioning) return publikProvisioning;
  publikProvisioning = publik
    .provisionInstall({
      build: publikBuild,
      store,
      device: publikDevice(),
      log: (e) =>
        recordEvent({ level: e.level, event: e.event, msg: e.msg, frame: 'publikProvision', context: e.context || {} })
    })
    .then((r) => {
      if (r.ok && r.minted) store.setPublik({ disconnected: false });
      publikPush();
      return publikState();
    })
    .finally(() => {
      publikProvisioning = null;
    });
  return publikProvisioning;
}

// x-publik-* headers from a streamed answer: the balance after admission
// (the hold is included), the claim state, the week. Settlement follows.
function publikNoteHeaders(headers) {
  const h = publik.readGatewayHeaders(headers);
  if (!h) return;
  const s = store.getSettings();
  const wallet = { ...(s.publik.wallet || {}) };
  if (h.balanceMicros !== null) wallet.balanceMicros = h.balanceMicros;
  if (h.claimState) wallet.claimState = h.claimState;
  if (h.weekUsedMicros !== null) wallet.weekUsedMicros = h.weekUsedMicros;
  if (h.weekBudgetMicros !== null || h.weekResetsAt) wallet.weekBudgetMicros = h.weekBudgetMicros;
  if (h.weekResetsAt) wallet.weekResetsAt = h.weekResetsAt;
  if (h.starterRemainingMicros !== null) wallet.starterRemainingMicros = h.starterRemainingMicros;
  store.setPublik({
    balanceMicros: h.balanceMicros !== null ? h.balanceMicros : s.publik.balanceMicros,
    balanceAt: Date.now(),
    claimState: h.claimState || s.publik.claimState,
    wallet,
    revoked: false
  });
  publikPush();
}

async function publikRefreshWallet() {
  const s = store.getSettings();
  if (!s.apiKeys.publik) return publikState();
  try {
    const w = await publik.fetchWallet({ baseUrl: s.publik.baseUrl || publikBuild.baseUrl, apiKey: s.apiKeys.publik });
    store.setPublik({
      wallet: w,
      balanceMicros: w.balanceMicros,
      balanceAt: Date.now(),
      claimState: w.claimState,
      claimUrl: w.claimUrl || (w.claimState === 'claimed' ? '' : s.publik.claimUrl),
      revoked: false,
      disconnected: false,
      lastError: ''
    });
  } catch (e) {
    if (e.status === 401) publikHandleRevoked(e);
    else
      recordEvent({
        level: 'warn',
        event: 'publik_wallet_failed',
        msg: e.message,
        frame: 'publikRefreshWallet',
        context: { status: e.status || null }
      });
  }
  publikPush();
  return publikState();
}
function publikScheduleWalletRefresh() {
  clearTimeout(publikWalletTimer);
  publikWalletTimer = setTimeout(() => {
    publikRefreshWallet().catch(() => {});
  }, 1500);
}

// 401 key_revoked: reprovision:true (idle sweep) → re-mint on our own with the
// same install_id; reprovision:false (removed from the dashboard) → stay
// disconnected until the user presses Reconnect.
function publikHandleRevoked(e) {
  const revokedType = !!(e && e.type === 'key_revoked');
  const silent = revokedType && e.reprovision === true;
  // "disconnected" is the dashboard/uninstaller removal only; a plain 401
  // (invalid_api_key) just asks for Reconnect.
  store.setPublik({ revoked: true, disconnected: revokedType && !silent, lastError: '' });
  if (silent) publikProvision().catch(() => {});
}
function publikHandleErrorAction(action) {
  if (!action || action.kind !== 'reprovision') return;
  publikHandleRevoked({ type: 'key_revoked', reprovision: true });
}

function registerPublikIpc() {
  handle('publik:state', () => publikState());
  handle('publik:accept-disclosure', async () => {
    // Consent precedes mint: this is the only path that calls POST /installs
    // for a fresh install. It also selects publik if the user had moved away.
    if (!publikBuild.available) return publikState();
    store.setPublik({ disclosureAccepted: publikBuild.disclosureVersion });
    store.setSettings({ provider: publik.PUBLIK_PROVIDER });
    return publikProvision();
  });
  handle('publik:reconnect', async () => {
    const s = store.getSettings();
    if (!s.publik.disclosureAccepted) return publikState();
    if (s.apiKeys.publik && !s.publik.revoked) return publikRefreshWallet();
    store.setPublik({ revoked: true });
    return publikProvision();
  });
  handle('publik:refresh', () => publikRefreshWallet());
  handle('publik:disconnect', async () => {
    const s = store.getSettings();
    if (s.apiKeys.publik) {
      try {
        await publik.revokeInstall({ baseUrl: s.publik.baseUrl || publikBuild.baseUrl, apiKey: s.apiKeys.publik });
      } catch (e) {
        /* the key is dropped locally regardless */
      }
    }
    store.setPublik({
      apiKey: '',
      keyId: '',
      revoked: false,
      disconnected: true,
      balanceMicros: null,
      wallet: null,
      lastError: ''
    });
    publikPush();
    return publikState();
  });
  // "Later" or the primary button on the first-run card: the card was shown for
  // this starter grant. Touches publik.cardShown only — the key stays in place
  // and the balance is kept (§12.1).
  handle('publik:card-seen', () => {
    try {
      publik.markCardSeen(store);
    } catch (e) {
      recordEvent({
        level: 'error',
        event: 'publik_card_seen_failed',
        msg: e.message,
        frame: 'publik:card-seen',
        context: {}
      });
    }
    publikPush();
    return publikState();
  });
  // The only path a gateway-supplied URL can take out of the app: publikhq.com
  // only. A link off that origin is dropped (the stored claim link stands in
  // when it is safe); nothing else is ever handed to the system browser.
  on('publik:open', (_e, url) => {
    const s = store.getSettings();
    const target = publik.resolveOpenTarget(url, s.publik.claimUrl);
    if (!target) {
      recordEvent({ level: 'warn', event: 'publik_open_dropped', msg: '', frame: 'publik:open', context: {} });
      return;
    }
    shell.openExternal(target).catch(() => {});
  });
}

module.exports = {
  publikBuild,
  publikNoteHeaders,
  publikScheduleWalletRefresh,
  publikHandleErrorAction,
  registerPublikIpc
};
