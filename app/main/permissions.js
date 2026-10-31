// OS permission checks and the permission gate window.
const { BrowserWindow, desktopCapturer, screen, systemPreferences } = require('electron');
const { handle, on } = require('./ipc-guard');
const { PRELOAD_PATH, rendererPage } = require('./platform');

let permWin = null;

function hasPermissionsWindow() {
  return !!permWin && !permWin.isDestroyed();
}

function closePermissionsWindow() {
  if (permWin && !permWin.isDestroyed()) {
    permWin.close();
    permWin = null;
  }
}

// systemPreferences.getMediaAccessStatus('screen') is unreliable: it can return
// 'not-determined' or 'denied' even after the user has granted Screen Recording,
// especially in dev mode (unsigned / no proper app bundle).  As a fallback we
// actually attempt a capture and inspect the thumbnail — if it contains any
// non-zero pixel data, macOS is giving us real screen content, i.e. granted.
async function verifyScreenAccess() {
  const sysStatus = systemPreferences.getMediaAccessStatus('screen');
  if (sysStatus === 'granted') return 'granted';

  // Fallback: try an actual capture and check the thumbnail for real pixels.
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 16, height: 16 }
    });
    if (sources.length > 0) {
      const bmp = sources[0].thumbnail.toBitmap();
      // toBitmap() returns raw RGBA bytes; any non-zero byte means real content
      if (bmp && bmp.some((byte) => byte !== 0)) return 'granted';
    }
  } catch (_) {}

  return sysStatus; // return the original system status if fallback didn't help
}

async function getPermissionStatus() {
  // systemPreferences.getMediaAccessStatus('microphone') is also implemented on
  // Windows (it reads the Settings > Privacy > Microphone toggle); 'screen' has
  // no per-app gate on Windows so verifyScreenAccess() falls straight through to
  // 'granted' there. Only genuinely ungated platforms (e.g. Linux) keep the old
  // hard-coded "granted" fallback.
  if (process.platform === 'darwin' || process.platform === 'win32') {
    return {
      mic: systemPreferences.getMediaAccessStatus('microphone'),
      screen: await verifyScreenAccess()
    };
  }
  return { mic: 'granted', screen: 'granted' };
}

async function requestPermissions() {
  if (process.platform !== 'darwin' && process.platform !== 'win32') return true;

  if (process.platform === 'darwin') {
    // Trigger the macOS microphone permission dialog (first-use only)
    const micStatus = systemPreferences.getMediaAccessStatus('microphone');
    if (micStatus !== 'granted') {
      await systemPreferences.askForMediaAccess('microphone');
    }

    // Trigger the macOS screen-recording permission dialog (first-use only).
    // There is no askForMediaAccess('screen'), but attempting to enumerate
    // sources via desktopCapturer will cause macOS to prompt the user.
    const screenStatus = await verifyScreenAccess();
    if (screenStatus !== 'granted') {
      try {
        await desktopCapturer.getSources({ types: ['screen'] });
      } catch (_) {}
    }
  }
  // Windows has no OS-level "ask" dialog (systemPreferences.askForMediaAccess is
  // macOS-only) — mic access is governed entirely by the Settings toggle the user
  // flips themselves, which getPermissionStatus() below reads directly.

  const status = await getPermissionStatus();
  return status.mic === 'granted' && status.screen === 'granted';
}

/**
 * What launch does about missing OS permissions. Pure, so each platform's branch is unit-tested.
 *  - 'gate': no platform today. macOS used to hold the whole app until both Microphone and Screen
 *    Recording were allowed, which blocked text-only use (typing a question, résumé prep); now each
 *    permission is asked for when the feature that needs it is first used.
 *  - 'beside': Windows, for a returning user whose microphone is off. The overlay starts at once and
 *    the window shows above it; Continue closes it with or without the microphone.
 *  - 'none': everything is allowed; Linux, which asks for nothing; or a first run on Windows, where
 *    onboarding's permissions step asks instead, so first run never shows two windows.
 */
function permissionGatePlan({ platform, onboarded, allGranted }) {
  if (allGranted) return 'none';
  if (platform === 'win32' && onboarded) return 'beside';
  return 'none';
}

/**
 * Opens the permissions window, or shows it if it is already open. With `above` (the overlay window,
 * on Windows) it stays on top of the overlay: both are always on top, and on Windows the one shown
 * last is above, so it is raised again whenever the overlay shows.
 */
function createPermissionsWindow({ above = null } = {}) {
  if (permWin && !permWin.isDestroyed()) {
    permWin.show();
    return;
  }
  const { workArea } = screen.getPrimaryDisplay();
  const W = 500,
    H = 540;
  permWin = new BrowserWindow({
    width: W,
    height: H,
    x: Math.round(workArea.x + (workArea.width - W) / 2),
    y: Math.round(workArea.y + (workArea.height - H) / 2),
    frame: false,
    transparent: true,
    hasShadow: true,
    resizable: false,
    skipTaskbar: false,
    fullscreenable: false,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  const win = permWin;
  // Closed by the user (Cmd+W, Alt+F4) rather than through closePermissionsWindow: forget it, or
  // window-all-closed keeps waiting for it and the app never quits.
  win.once('closed', () => {
    if (permWin === win) permWin = null;
  });
  if (above) {
    win.setAlwaysOnTop(true, 'screen-saver', 2);
    const raise = () => {
      if (!win.isDestroyed()) win.moveTop();
    };
    above.on('show', raise);
    win.once('closed', () => {
      if (!above.isDestroyed()) above.removeListener('show', raise);
    });
  }
  win.loadFile(rendererPage('permissions.html'));
  win.webContents.on('did-finish-load', () => win.show());
}

// onGranted runs when the user clicks Continue: on macOS once both permissions are granted, on
// Windows always (the overlay is already running, and the microphone is the user's choice there).
function registerPermissionsIpc({ onGranted }) {
  handle('permissions:check', () => getPermissionStatus());
  handle('permissions:request', () => requestPermissions());
  on('permissions:continue', async () => {
    if (process.platform !== 'win32') {
      const status = await getPermissionStatus();
      if (status.mic !== 'granted' || status.screen !== 'granted') return;
    }
    closePermissionsWindow();
    onGranted();
  });
}

module.exports = {
  hasPermissionsWindow,
  closePermissionsWindow,
  requestPermissions,
  permissionGatePlan,
  createPermissionsWindow,
  registerPermissionsIpc
};
