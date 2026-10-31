// IPC channels that do not belong to a single feature module: settings,
// transcript, asking, profile documents, app-link consent and app plumbing.
const { app, clipboard, dialog, shell, session: electronSession } = require('electron');
const { handle, on } = require('./ipc-guard');
const fs = require('fs');
const path = require('path');
const store = require('../../src/storage/store');
const { DOCUMENT_EXTENSIONS, parseDocumentFile } = require('../../src/context/resume');
const { appLinkConsentState, revokeAppLinkCaller, revokeAllAppLinkCallers } = require('../../src/integrations/applink');
const { WIN_BUILD, WIN_SUPPORTS_CONTENT_PROTECTION } = require('./platform');
const { session, send } = require('./session');
const { getWin } = require('./window');
const { runFeature, cancelCurrent } = require('./llm-runner');
const { MODES } = require('../../src/llm/prompts');
const {
  isAllowedPaneUrl,
  isPlainObject,
  isValidAskPayload,
  isShortString,
  isValidSettingsPatch,
  MAX_ASK_TEXT_CHARS,
  MAX_ANSWER_CHARS
} = require('./ipc-policy');
const slides = require('./slides');
const { setCapturing } = require('./capture');
const { configure: configureKnowledge, stopKnowledge } = require('./knowledge');

// -------- resume / job-description file import --------
// The dialog runs in MAIN and is filtered to PDF, DOCX, Markdown and text; the
// renderer never supplies a path. The parsed text is RETURNED to the renderer,
// which drops it into the Profile tab's résumé or job-description field so
// settings keep a single source of truth.
async function pickAndParseDocument() {
  const res = await dialog.showOpenDialog(getWin(), {
    properties: ['openFile'],
    filters: [{ name: 'Résumé / Job description', extensions: DOCUMENT_EXTENSIONS }]
  });
  if (res.canceled || !res.filePaths.length) return null;
  const filePath = res.filePaths[0];
  const text = await parseDocumentFile(filePath);
  return { fileName: path.basename(filePath), text };
}

// "Delete all my data": settings, encrypted API keys and meeting history. Asks
// first, then restarts Onscreenly as a fresh install. Downloaded Whisper models
// are public files and stay; they can be removed in Settings → Audio.
async function deleteAllData() {
  const { response } = await dialog.showMessageBox(getWin(), {
    type: 'warning',
    buttons: ['Cancel', 'Delete everything'],
    defaultId: 0,
    cancelId: 0,
    message: 'Delete all your Onscreenly data?',
    detail:
      'This removes your settings, saved API keys, résumé and profile text, meeting history, and the list of programs allowed to use Onscreenly from this computer, then restarts Onscreenly. Downloaded Whisper models are kept. This cannot be undone.'
  });
  if (response !== 1) return { deleted: false };
  if (session.state.capturing) await setCapturing(false).catch(() => {});
  stopKnowledge();
  session.transcript.splice(0, session.transcript.length);
  // Stop every writer first: a debounced save or meeting notes still on their way must not write
  // the history back after it is deleted.
  if (session.meetingMemory) session.meetingMemory.dispose();
  if (session.meetingStore) session.meetingStore.clearAll();
  else {
    const userData = app.getPath('userData');
    for (const name of ['meetings.json', 'meetings.json.tmp', 'meetings.json.bak']) {
      fs.rmSync(path.join(userData, name), { force: true });
    }
  }
  // Programs the user let see or control Onscreenly, and anything the windows stored.
  revokeAllAppLinkCallers();
  await electronSession.defaultSession.clearStorageData().catch(() => {});
  await store.deleteLocalSettings();
  // exit() skips will-quit, so nothing writes settings or meetings back.
  app.relaunch();
  app.exit(0);
  return { deleted: true };
}

function registerAppIpc() {
  // Redact on the way out, strip on the way in: the publik key never enters the
  // renderer, and the renderer's whole-object Save can never clobber it.
  handle('settings:get', () => store.redactForRenderer(store.getSettings()));
  handle('settings:set', async (_e, patch) => {
    if (!isValidSettingsPatch(patch)) throw new Error('Refused: settings must be a plain object under 2 MB');
    session.sttDisabled = false;
    const next = store.setSettings(store.stripRendererPatch(patch));
    // Restart slide polling with the new interval when capturing (keeps slides).
    if (session.state.capturing) slides.startSlideLoop();
    // A changed key is on disk (encrypted) before Save reports success, and a failed write is
    // reported as one rather than as "Saved".
    await store.flushSecrets();
    const saveError = store.lastSaveError();
    // The renderer shows these as "Couldn’t save: <reason>."
    if (saveError)
      throw new Error(`the settings file could not be written (${saveError.message}); check free disk space`);
    if (store.secretsSaveError()) {
      throw new Error(
        'your API key could not be stored in the system key store; it works until you quit, so try Save again'
      );
    }
    // Knowledge on/off or excluded folders changed: re-index in the background.
    configureKnowledge().catch((e) => console.warn('[knowledge] configure failed:', e && e.message));
    return store.redactForRenderer(next);
  });
  handle('data:key-storage', () => store.keyStorageStatus());
  handle('data:delete-all', () => deleteAllData());

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
  // Stop: cancels the answer in progress (Send while busy, or Escape).
  on('llm:cancel', () => cancelCurrent());
  on('ask', (_e, payload) => {
    if (!isValidAskPayload(payload, MODES)) {
      // A well-formed question that is only too long gets an answer the user
      // can see, so the panel does not stay busy waiting; anything else is
      // dropped.
      if (isPlainObject(payload) && typeof payload.text === 'string' && payload.text.length > MAX_ASK_TEXT_CHARS) {
        send('llm:error', {
          message: `That question is too long to send (over ${MAX_ASK_TEXT_CHARS.toLocaleString('en-US')} characters). Shorten it and try again.`
        });
      }
      return;
    }
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
  // Copy / Save as Markdown under an answer. Main writes the clipboard and the
  // file, so the sandboxed window needs no clipboard or file access of its own.
  handle('answer:copy', async (_e, text) => {
    if (!isShortString(text, MAX_ANSWER_CHARS)) throw new Error('Refused: invalid answer text');
    // Asynchronous since Electron 44.
    await clipboard.writeText(text);
    return true;
  });
  handle('answer:save-markdown', async (_e, payload) => {
    if (!isPlainObject(payload) || !isShortString(payload.text, MAX_ANSWER_CHARS)) {
      throw new Error('Refused: invalid answer text');
    }
    const defaultName = payload.kind === 'resume-analysis' ? 'Résumé analysis.md' : 'Onscreenly answer.md';
    const res = await dialog.showSaveDialog(getWin(), {
      defaultPath: path.join(app.getPath('documents'), defaultName),
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    });
    if (res.canceled || !res.filePath) return { saved: false };
    await fs.promises.writeFile(res.filePath, payload.text, 'utf8');
    return { saved: true, fileName: path.basename(res.filePath) };
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
    // Only a caller that is in the consent list can be forgotten; its id came
    // from the app-link client and has no length limit of its own.
    const callers = (appLinkConsentState() || {}).callers || {};
    if (typeof callerId !== 'string' || !Object.prototype.hasOwnProperty.call(callers, callerId)) {
      throw new Error('Refused: unknown caller id');
    }
    // Forgetting a caller also clears its separate slide-caption consent decision,
    // so a caller the user re-approves later is asked about slides again too,
    // rather than silently inheriting whatever it was granted or denied before.
    store.clearSlidesConsent(callerId);
    return revokeAppLinkCaller(callerId);
  });
}

module.exports = { registerAppIpc };
