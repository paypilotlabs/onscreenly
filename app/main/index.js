// Onscreenly main process entry: identity bootstrap, launch and lifecycle.
const { app, BrowserWindow, globalShortcut } = require('electron');
// Must run before any module that reads the profile directory (settings store).
const { bootstrapIdentity } = require('../../src/platform/app-identity');
bootstrapIdentity(app);

// One copy per profile. A second launch would open its own overlay and keep its
// own copy of the settings, keys and meeting history, and whichever copy saved
// last would overwrite the other. It hands over to the running copy instead.
if (!app.requestSingleInstanceLock()) {
  app.exit(0);
  return;
}

const path = require('path');
const store = require('../../src/storage/store');
const { createLLM } = require('../../src/llm/llm');
const { startAppLink, stopAppLink, recordEvent } = require('../../src/integrations/applink');
const { createMeetingStore } = require('../../src/meetings/meetings');
const { createMeetingMemory } = require('../../src/meetings/meeting-memory');
const { isMac, isWindows } = require('./platform');
const { meetingHistoryKeep, registerMeetingHistoryIpc } = require('./meeting-history');
const { session, send, MAX_TRANSCRIPT_TURNS } = require('./session');
const { getWin, createWindow, registerWindowIpc } = require('./window');
const { initWhisper, shutdownWhisper, registerWhisperIpc } = require('./whisper');
const { stopSlideLoop, listSlides, registerSlidesIpc } = require('./slides');
const { requestCapture, registerCaptureIpc } = require('./capture');
const { publikBuild, registerPublikIpc } = require('./publik-controller');
const {
  hasPermissionsWindow,
  closePermissionsWindow,
  requestPermissions,
  permissionGatePlan,
  createPermissionsWindow,
  registerPermissionsIpc
} = require('./permissions');
const { registerShortcuts, registerShortcutsIpc } = require('./shortcuts');
const { registerHelpIpc, checkForUpdateWhenLoaded } = require('./help');
const { installMediaHandlers } = require('./media');
const { registerAppIpc } = require('./ipc');
const { configure: configureKnowledge, registerKnowledgeIpc, stopKnowledge } = require('./knowledge');
const { safeStorageBackend } = require('./secure-storage');

// macOS meeting audio comes from a Core Audio tap (Electron's default since 39,
// the only path from 45). The ScreenCaptureKit path it replaces kept a capture
// of the whole display open for the entire call to carry the audio, and that
// second capture broke the meeting app's own screen share (Teams showed the
// other side a share that never loaded). A tap needs macOS's separate System
// Audio Recording permission; renderer/js/audio.js says so when it is missing.

// Linux runs natively on Wayland since Electron 38 (--ozone-platform defaults
// to auto), so no Linux switches are needed.

// Windows never blocks startup on an unresolved permission (see app.whenReady()
// below), so launchApp() can already have run once by the time the user grants
// access and clicks Continue in the gate window (permissions:continue also
// calls launchApp()). Without this guard the second call re-creates the main
// BrowserWindow (createWindow() has no existing-window check), re-registers
// global shortcuts and re-starts the applink server -- a real, reachable
// regression, not a hypothetical.
let appLaunched = false;

// Onscreenly's pages never navigate, open windows or embed webviews. Refusing
// all three means injected content cannot replace a page that holds the
// preload bridge, or open one.
app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event) => event.preventDefault());
  contents.on('will-attach-webview', (event) => event.preventDefault());
});

registerAppIpc();
registerKnowledgeIpc();
registerMeetingHistoryIpc();
registerShortcutsIpc();
registerHelpIpc();
registerPublikIpc();
registerCaptureIpc();
registerWhisperIpc();
registerSlidesIpc();
registerWindowIpc();
registerPermissionsIpc({ onGranted: () => launchApp() });

// -------- launch (called after permissions are confirmed) --------
function launchApp() {
  if (appLaunched) {
    // Already launched once (Windows startup runs launchApp() unconditionally
    // even while the permission gate is still showing). Just dismiss the gate
    // and bring the existing main window forward instead of building a second
    // one on top of it.
    closePermissionsWindow();
    const win = getWin();
    if (win && !win.isDestroyed()) {
      win.showInactive();
    }
    return;
  }
  appLaunched = true;

  if (isMac && app.dock) app.dock.hide();

  // Before the app-link snapshot and before the window exists, so a first run
  // boots with provider 'publik'. Runs once per settings file and never moves
  // a user who has a working key. No network call happens here.
  if (store.applyPublikDefault(publikBuild)) {
    recordEvent({ level: 'info', event: 'publik_default_applied', msg: '', frame: 'launchApp', context: {} });
  }

  initWhisper(app.getPath('userData'));

  const meetingStore = createMeetingStore({
    file: path.join(app.getPath('userData'), 'meetings.json'),
    debounceMs: 1500,
    // Once per failure streak: the transcript stays in memory and the next save retries.
    onError: (e) =>
      send('status', {
        message: `Couldn’t save meeting history (${(e && e.code) || (e && e.message) || 'write failed'}). The transcript is kept while Onscreenly runs; free some disk space or check the folder’s permissions.`,
        code: 'meetings'
      })
  });
  const meetingMemory = createMeetingMemory({
    store: meetingStore,
    llmFactory: () => createLLM(store.getSettings()),
    getKeep: () => meetingHistoryKeep(store.getSettings()),
    log: (msg) => console.log('[meetings]', msg)
  });
  session.meetingStore = meetingStore;
  session.meetingMemory = meetingMemory;
  session.restoredTurns = meetingMemory.resumeOpen();
  if (session.restoredTurns.length) session.transcript.push(...session.restoredTurns.slice(-MAX_TRANSCRIPT_TURNS));
  meetingMemory
    .catchUp()
    .then((n) => {
      if (n) console.log(`[meetings] wrote notes for ${n} earlier meeting(s)`);
    })
    .catch(() => {});

  installMediaHandlers();

  // Started before the shortcuts so their registration failures are recorded.
  startAppLink({
    snapshot: () => ({
      state: session.state,
      transcript: session.transcript,
      settings: store.getSettings(),
      sttDisabled: session.sttDisabled,
      shortcuts: { ...session.shortcutState },
      windowAlive: !!(getWin() && !getWin().isDestroyed()),
      slides: listSlides()
    }),
    // Through the same queue as the button, so the next press toggles from the right state.
    setCapturing: requestCapture,
    getSlides: () => listSlides(),
    getSlidesConsent: (callerId) => store.getSlidesConsent(callerId),
    setSlidesConsent: (callerId, decision) => store.setSlidesConsent(callerId, decision),
    // Looked up rather than captured: the window is recreated on 'activate',
    // so a reference taken at startup goes stale.
    getWindow: () => getWin()
  });

  createWindow();
  if (getWin()) checkForUpdateWhenLoaded(getWin());
  reportMeetingHistoryStatus(meetingStore.status());
  registerShortcuts();
  // Index the Obsidian vault in the background when Knowledge is on.
  configureKnowledge().catch((e) => console.warn('[knowledge] could not index the vault:', e && e.message));
}

// How loading the meeting history went, said once when the overlay has loaded.
function reportMeetingHistoryStatus(status) {
  const name = (file) => (file ? path.basename(file) : '');
  const message =
    status.state === 'recovered'
      ? `Part of your meeting history could not be read and was restored from the last good copy. The damaged file was kept as ${name(status.aside)}.`
      : status.state === 'corrupt'
        ? `Your meeting history could not be read, so new meetings start a fresh history. The old file was kept as ${name(status.aside)}.`
        : status.state === 'too-large'
          ? 'Your meeting history is too large to load, so new meetings aren’t saved. Archive it in Settings › API keys › Your data to start a new one; nothing is deleted.'
          : '';
  if (!message) return;
  const win = getWin();
  if (!win) return;
  win.webContents.once('did-finish-load', () => send('status', { message, code: 'meetings' }));
}

// -------- lifecycle --------
app.on('second-instance', () => {
  const win = getWin();
  if (win && !win.isDestroyed()) win.showInactive();
  else if (hasPermissionsWindow()) createPermissionsWindow(); // shows the existing one
});

app.whenReady().then(async () => {
  if (isWindows) {
    process.title = 'Onscreenly';
  }

  // Before anything reads settings: load API keys from the encrypted store and
  // move any plaintext keys from an older profile into it.
  const keyStorage = await store.initSecureStorage(safeStorageBackend);
  console.log(`[onscreenly] API key storage: ${keyStorage.mode}`);

  // macOS starts straight away and asks for the microphone when a session starts and for Screen
  // Recording when a screen feature first runs, so text-only use needs neither. Windows has no OS-level modal
  // permission dialog to block startup on (no askForMediaAccess() equivalent; the mic toggle lives in
  // Settings), so it never withholds the overlay: on a first run onboarding's permissions step asks,
  // and a returning user whose mic is off gets the window beside the overlay instead of no way at all
  // to see or act on it ("not able to give permission ... coz there is no option"). See
  // permissionGatePlan.
  const plan = permissionGatePlan({
    platform: process.platform,
    onboarded: !!store.getSettings().onboarded,
    // Only Windows looks at permissions at launch (its window beside the overlay). macOS asks for
    // each permission when it is first needed, so launch prompts for nothing there.
    allGranted: process.platform === 'win32' ? await requestPermissions() : true
  });
  if (plan === 'gate') {
    createPermissionsWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createPermissionsWindow();
    });
    return;
  }

  launchApp();
  if (plan === 'beside') createPermissionsWindow({ above: getWin() });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  // Quitting mid-meeting is a pause, not an end: the meeting stays open on disk
  // so a relaunch within the resume window picks it back up (a stale one is
  // closed and its notes written at the next launch). Just get the bytes down.
  if (session.meetingMemory) {
    const flushed = session.meetingMemory.flush();
    if (flushed && !flushed.ok)
      console.error('[meetings] history not saved on quit:', flushed.error && flushed.error.message);
  }
  // Best effort, deliberately not blocking the quit: the library also removes
  // the instance file from a `process.on('exit')` handler, and a file left
  // behind is harmless anyway because readers check whether the PID is alive.
  // Delaying shutdown to tidy a directory would be the wrong trade.
  stopAppLink();
  stopSlideLoop();
  stopKnowledge();
  shutdownWhisper();
});
app.on('window-all-closed', (e) => {
  // Don't quit while the permissions window is open — the user may be in System Settings
  if (hasPermissionsWindow()) {
    e.preventDefault();
    return;
  }
  app.quit();
});
