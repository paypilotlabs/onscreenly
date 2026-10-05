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
  createPermissionsWindow,
  registerPermissionsIpc
} = require('./permissions');
const { registerShortcuts } = require('./shortcuts');
const { installMediaHandlers } = require('./media');
const { registerAppIpc } = require('./ipc');

// No Chromium switches are needed on Electron 44. macOS system-audio loopback
// uses Core Audio taps by default since Electron 39 (it needs
// NSAudioCaptureUsageDescription, set in electron-builder.cjs), and Linux runs
// natively on Wayland since Electron 38 (--ozone-platform defaults to auto).

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
}

// -------- lifecycle --------
app.whenReady().then(async () => {
  if (isWindows) {
    process.title = 'Onscreenly';
  }

  if (isMac) {
    const allGranted = await requestPermissions();
    if (!allGranted) {
      // Show the permissions gate — the dock stays visible so the user can find the app
      createPermissionsWindow();
      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createPermissionsWindow();
      });
      return;
    }
  } else if (isWindows) {
    // Windows has no OS-level modal permission dialog to block startup on —
    // there is no askForMediaAccess() equivalent, and the only way to change
    // the mic toggle is to leave the app and use Settings — so unlike macOS
    // this never withholds the main window. It surfaces the same in-app
    // gate as an informational window alongside the app instead of leaving
    // the user with no option at all to see or act on the permission state
    // ("not able to give permission ... coz there is no option").
    const allGranted = await requestPermissions();
    if (!allGranted) {
      createPermissionsWindow();
    }
  }

  launchApp();
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
