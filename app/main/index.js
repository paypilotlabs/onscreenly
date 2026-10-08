// Onscreenly main process entry: identity bootstrap, launch and lifecycle.
const { app, BrowserWindow, globalShortcut } = require('electron');
// Must run before any module that reads the profile directory (settings store).
const { bootstrapIdentity } = require('../../src/platform/app-identity');
bootstrapIdentity(app);

const path = require('path');
const store = require('../../src/storage/store');
const { createLLM } = require('../../src/llm/llm');
const { startAppLink, stopAppLink, recordEvent } = require('../../src/integrations/applink');
const { createMeetingStore } = require('../../src/meetings/meetings');
const { createMeetingMemory } = require('../../src/meetings/meeting-memory');
const { isMac, isWindows } = require('./platform');
const { session, MAX_TRANSCRIPT_TURNS } = require('./session');
const { getWin, createWindow, registerWindowIpc } = require('./window');
const { initWhisper, shutdownWhisper, registerWhisperIpc } = require('./whisper');
const { stopSlideLoop, listSlides, registerSlidesIpc } = require('./slides');
const { setCapturing, registerCaptureIpc } = require('./capture');
const { publikBuild, registerPublikIpc } = require('./publik-controller');
const {
  hasPermissionsWindow,
  closePermissionsWindow,
  requestPermissions,
  permissionGatePlan,
  createPermissionsWindow,
  registerPermissionsIpc
} = require('./permissions');
const { registerShortcuts } = require('./shortcuts');
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

  const meetingMemory = createMeetingMemory({
    store: createMeetingStore({ file: path.join(app.getPath('userData'), 'meetings.json'), debounceMs: 1500 }),
    llmFactory: () => createLLM(store.getSettings()),
    log: (msg) => console.log('[meetings]', msg)
  });
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
    setCapturing,
    getSlides: () => listSlides(),
    getSlidesConsent: (callerId) => store.getSlidesConsent(callerId),
    setSlidesConsent: (callerId, decision) => store.setSlidesConsent(callerId, decision),
    // Looked up rather than captured: the window is recreated on 'activate',
    // so a reference taken at startup goes stale.
    getWindow: () => getWin()
  });

  createWindow();
  registerShortcuts();
  // Index the Obsidian vault in the background when Knowledge is on.
  configureKnowledge().catch((e) => console.warn('[knowledge] could not index the vault:', e && e.message));
}

// -------- lifecycle --------
app.whenReady().then(async () => {
  if (isWindows) {
    process.title = 'Onscreenly';
  }

  // Before anything reads settings: load API keys from the encrypted store and
  // move any plaintext keys from an older profile into it.
  const keyStorage = await store.initSecureStorage(safeStorageBackend);
  console.log(`[onscreenly] API key storage: ${keyStorage.mode}`);

  // macOS asks for both permissions here and, while one is missing, shows the permissions window
  // first, with the dock visible so the user can find the app. Windows has no OS-level modal
  // permission dialog to block startup on (no askForMediaAccess() equivalent; the mic toggle lives in
  // Settings), so it never withholds the overlay: on a first run onboarding's permissions step asks,
  // and a returning user whose mic is off gets the window beside the overlay instead of no way at all
  // to see or act on it ("not able to give permission ... coz there is no option"). See
  // permissionGatePlan.
  const plan = permissionGatePlan({
    platform: process.platform,
    onboarded: !!store.getSettings().onboarded,
    allGranted: await requestPermissions()
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
  if (session.meetingMemory) session.meetingMemory.flush();
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
