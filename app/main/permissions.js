// OS permission checks and the permission gate window.
const { BrowserWindow, desktopCapturer, ipcMain, screen, systemPreferences } = require('electron');
const { PRELOAD_PATH, rendererPage } = require('./platform');

let permWin = null;

function hasPermissionsWindow() {
  return !!permWin;
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

function createPermissionsWindow() {
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
      sandbox: false
    }
  });
  permWin.loadFile(rendererPage('permissions.html'));
  permWin.webContents.on('did-finish-load', () => permWin.show());
}

// onGranted runs once both permissions are granted and the user clicks Continue.
function registerPermissionsIpc({ onGranted }) {
  ipcMain.handle('permissions:check', () => getPermissionStatus());
  ipcMain.handle('permissions:request', () => requestPermissions());
  ipcMain.on('permissions:continue', async () => {
    const status = await getPermissionStatus();
    if (status.mic === 'granted' && status.screen === 'granted') {
      if (permWin) {
        permWin.close();
        permWin = null;
      }
      onGranted();
    }
  });
}

module.exports = {
  hasPermissionsWindow,
  closePermissionsWindow,
  requestPermissions,
  createPermissionsWindow,
  registerPermissionsIpc
};
