// IPC channels that do not belong to a single feature module: settings,
// transcript, asking, profile documents, app-link consent and app plumbing.
const { app, dialog, shell } = require('electron');
const { handle, on } = require('./ipc-guard');
const path = require('path');
const store = require('../../src/storage/store');
const { parseDocumentFile } = require('../../src/context/resume');
const { appLinkConsentState, revokeAppLinkCaller } = require('../../src/integrations/applink');
const { WIN_BUILD, WIN_SUPPORTS_CONTENT_PROTECTION } = require('./platform');
const { session, send } = require('./session');
const { getWin } = require('./window');
const { runFeature } = require('./llm-runner');
const { MODES } = require('../../src/llm/prompts');
const { isAllowedPaneUrl, isShortString, isValidAskPayload, isValidSettingsPatch } = require('./ipc-policy');
const slides = require('./slides');

// -------- resume / job-description file import --------
// The dialog runs in MAIN and is filtered to pdf/docx; the renderer never supplies a path.
// The parsed text is RETURNED to the renderer, which drops it into the existing
// #resume-text / #job-description textareas so settings keep a single source of truth.
async function pickAndParseDocument() {
  const res = await dialog.showOpenDialog(getWin(), {
    properties: ['openFile'],
    filters: [{ name: 'Resume / Job description', extensions: ['pdf', 'docx'] }]
  });
  if (res.canceled || !res.filePaths.length) return null;
  const filePath = res.filePaths[0];
  const text = await parseDocumentFile(filePath);
  return { fileName: path.basename(filePath), text };
}

function registerAppIpc() {
  // Redact on the way out, strip on the way in: the publik key never enters the
  // renderer, and the renderer's whole-object Save can never clobber it.
  handle('settings:get', () => store.redactForRenderer(store.getSettings()));
  handle('settings:set', (_e, patch) => {
    if (!isValidSettingsPatch(patch)) throw new Error('Refused: settings must be a plain object under 2 MB');
    session.sttDisabled = false;
    const next = store.setSettings(store.stripRendererPatch(patch));
    // Restart slide polling with the new interval when capturing (keeps slides).
    if (session.state.capturing) slides.startSlideLoop();
    return store.redactForRenderer(next);
  });

  handle('platform:info', () => ({
    platform: process.platform,
    winBuild: WIN_BUILD,
    winSupportsContentProtection: WIN_SUPPORTS_CONTENT_PROTECTION
  }));
  handle('transcript:clear', () => {
    if (session.meetingMemory) session.meetingMemory.end().catch(() => {}); // it stays in history with its notes
    session.transcript.splice(0, session.transcript.length);
    slides.resetSlidesSession();
    send('slides:update', { count: 0, last: null });
    return { ok: true };
  });
  on('ask', (_e, payload) => {
    if (!isValidAskPayload(payload, MODES)) return;
    runFeature(payload.mode, payload.text);
  });
  // Only the OS privacy panes the onboarding and permission screens link to.
  on('open-pane', (_e, url) => {
    if (!isAllowedPaneUrl(url)) {
      console.warn('[ipc] refused open-pane for a URL outside the allowlist');
      return;
    }
    shell.openExternal(url).catch(() => {});
  });
  on('app:quit', () => app.quit());
  on('log', (_e, msg) => console.log('[renderer]', String(msg).slice(0, 2000)));

  handle('profile:pickDocument', async () => {
    try {
      const picked = await pickAndParseDocument();
      if (!picked) return { canceled: true };
      return { canceled: false, fileName: picked.fileName, text: picked.text };
    } catch (e) {
      return { canceled: false, error: (e && e.message) || String(e) };
    }
  });
  handle('applink:state', () => appLinkConsentState());
  handle('applink:revoke', (_e, callerId) => {
    if (!isShortString(callerId, 200)) throw new Error('Refused: invalid caller id');
    // Forgetting a caller also clears its separate slide-caption consent decision,
    // so a caller the user re-approves later is asked about slides again too,
    // rather than silently inheriting whatever it was granted or denied before.
    store.clearSlidesConsent(callerId);
    return revokeAppLinkCaller(callerId);
  });
}

module.exports = { registerAppIpc };
