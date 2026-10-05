// The overlay window: creation, screen-share protection, position memory,
// dragging and click-through.
const { BrowserWindow, ipcMain, screen } = require('electron');
const store = require('../../src/storage/store');
const { readEnvironment } = require('../../src/platform/environment');
const { recordEvent } = require('../../src/integrations/applink');
const {
  isMac,
  isWindows,
  isLinux,
  PRELOAD_PATH,
  rendererPage,
  WIN_BUILD,
  WIN_SUPPORTS_CONTENT_PROTECTION,
  WIN_IS_LOCAL_CONSOLE_SESSION
} = require('./platform');
const { session, setSender, send } = require('./session');

let win = null;
setSender((channel, data) => {
  if (win && !win.isDestroyed()) win.webContents.send(channel, data);
});

function getWin() {
  return win;
}

// The window has a transparent, click-through strip on each side of the main column so
// the history sidebar can slide out left or right. Must match --main-w/--side-w in
// styles.css. Saved windowX is the main column's x, not the window's.
const MAIN_W = 700,
  SIDE_W = 300;

function saveWindowPosition() {
  if (!win || win.isDestroyed()) return;
  const [x, y] = win.getPosition();
  store.setSettings({ windowX: x + SIDE_W, windowY: y });
}

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  const W = SIDE_W + MAIN_W + SIDE_W,
    H = 600;

  const savedSettings = store.getSettings();
  let startX = Math.round(workArea.x + (workArea.width - MAIN_W) / 2);
  let startY = workArea.y + 6;

  if (savedSettings.windowX !== null && savedSettings.windowY !== null) {
    const clampedX = Math.max(
      workArea.x - MAIN_W + 100,
      Math.min(savedSettings.windowX, workArea.x + workArea.width - 100)
    );
    // Keep the whole window on screen, not just a 40px sliver of it. The old
    // `- 40` let a 600px-tall window sit at y=607 on a 960px display, pushing
    // the composer and action row off the bottom edge with no way to reach them.
    const clampedY = Math.max(workArea.y, Math.min(savedSettings.windowY, workArea.y + workArea.height - H));
    startX = clampedX;
    startY = clampedY;
  }

  const winOptions = {
    width: W,
    height: H,
    x: startX - SIDE_W,
    y: startY,
    enableLargerThanScreen: true,
    // The window is shown inactive and never takes focus, so without this macOS spends the
    // first click only activating it and a press on the drag handle does nothing.
    acceptFirstMouse: true,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  };

  // Fix 1: On Windows, set type:'toolbar' which sets WS_EX_TOOLWINDOW.
  // This removes the window from Alt+Tab AND the taskbar entirely.
  // On macOS, this is not needed (dock hiding + Mission Control handle it).
  if (isWindows) {
    winOptions.type = 'toolbar';
  }

  win = new BrowserWindow(winOptions);

  // Fix 2: Only call setContentProtection if the OS supports it, and only on
  // a session where it will not blank the window out for the user themself
  // (see WIN_IS_LOCAL_CONSOLE_SESSION in platform.js — RDP/VM/Cloud-PC-style sessions
  // render a WDA_EXCLUDEFROMCAPTURE window fully invisible, not just hidden
  // from capture). On older builds, or a non-local-console Windows session,
  // we skip it silently and send a warning to the renderer instead.
  const shouldProtect = !readEnvironment('NO_PROTECT') && WIN_IS_LOCAL_CONSOLE_SESSION;
  if (shouldProtect) {
    if (isLinux) {
      // setContentProtection has no effect on Linux (no windowing-system-level
      // capture-exclusion primitive it can map to) — skip the no-op call and
      // say so, rather than pretending the window is hidden from screen shares.
      console.log(
        '[onscreenly] Running on Linux: native screen protection (setContentProtection) is not supported and has been skipped.'
      );
    } else if (WIN_SUPPORTS_CONTENT_PROTECTION) {
      win.setContentProtection(true);
    } else {
      // Will notify the renderer after it loads
      console.log(
        `[onscreenly] Windows build ${WIN_BUILD} < 19041 — setContentProtection not supported. Window may appear in screen shares.`
      );
    }
  } else if (isWindows && !WIN_IS_LOCAL_CONSOLE_SESSION && !readEnvironment('NO_PROTECT')) {
    console.log(
      `[onscreenly] Windows session is not a local console session (SESSIONNAME=${process.env.SESSIONNAME}) — skipping setContentProtection so the window stays visible to you. Window may appear in screen shares.`
    );
  }

  win.setAlwaysOnTop(true, 'screen-saver', 1);
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  if (isMac && typeof win.setHiddenInMissionControl === 'function') win.setHiddenInMissionControl(true);

  win.loadFile(rendererPage('index.html'));

  let moveSaveTimer = null;
  win.on('moved', () => {
    clearTimeout(moveSaveTimer);
    moveSaveTimer = setTimeout(saveWindowPosition, 500);
  });

  win.setTitle('Onscreenly'); // set before load

  win.webContents.on('did-finish-load', () => {
    win.showInactive();
    win.setTitle('Onscreenly');
    if (session.restoredTurns.length) {
      // A meeting was in progress when Onscreenly last exited: put its transcript back
      // in the sidebar so Recap / Follow-up pick up where the conversation was.
      const turns = session.restoredTurns;
      session.restoredTurns = [];
      send('transcript:restore', { turns });
      const ageMin = Math.max(1, Math.round((Date.now() - turns[turns.length - 1].ts) / 60000));
      send('status', { message: `Resumed your meeting from ${ageMin} min ago (${turns.length} turns restored).` });
    }
    // Warn about missing content protection on old Windows builds
    if (isWindows && shouldProtect && !WIN_SUPPORTS_CONTENT_PROTECTION) {
      send('status', {
        message: `Heads up: your Windows version (build ${WIN_BUILD}) does not support screen-share hiding. Upgrade to Windows 10 build 19041+ or Windows 11 to enable invisibility in screen shares.`
      });
    }
    // Warn when protection was skipped because this is not a local console
    // session (RDP / Cloud PC / VM console) — see WIN_IS_LOCAL_CONSOLE_SESSION.
    if (isWindows && !readEnvironment('NO_PROTECT') && !WIN_IS_LOCAL_CONSOLE_SESSION) {
      send('status', {
        message:
          'Heads up: screen-share hiding is off for this session (remote desktop / cloud PC / VM sessions can render the window invisible to you as well when it is on). The window will be visible in screen shares here.'
      });
    }
  });
  win.webContents.on('render-process-gone', (_e, d) => {
    console.log('[onscreenly] renderer gone', JSON.stringify(d));
    recordEvent({
      level: 'fatal',
      event: 'renderer_gone',
      code: d && d.reason,
      msg: 'renderer process ended: ' + JSON.stringify(d),
      frame: 'BrowserWindow'
    });
  });
}

// Window dragging is done here rather than with CSS drag regions, which misbehave while the
// renderer toggles click-through. The window follows the cursor until the renderer says stop.
let windowDrag = null;
function stopWindowDrag() {
  clearInterval(windowDrag);
  windowDrag = null;
}

function registerWindowIpc() {
  ipcMain.on('mouse:ignore', (_e, v) => {
    if (win) win.setIgnoreMouseEvents(!!v, { forward: true });
  });
  ipcMain.on('window:drag-start', () => {
    if (!win || win.isDestroyed()) return;
    stopWindowDrag();
    const cursor = screen.getCursorScreenPoint();
    const bounds = win.getBounds();
    const offsetX = cursor.x - bounds.x,
      offsetY = cursor.y - bounds.y;
    windowDrag = setInterval(() => {
      if (!win || win.isDestroyed()) {
        stopWindowDrag();
        return;
      }
      const { x, y } = screen.getCursorScreenPoint();
      // setBounds with a fixed size: setPosition can resize the window when crossing mixed-DPI displays on Windows.
      win.setBounds({ x: x - offsetX, y: y - offsetY, width: bounds.width, height: bounds.height });
    }, 16);
  });
  ipcMain.on('window:drag-end', () => {
    if (!windowDrag) return;
    stopWindowDrag();
    saveWindowPosition();
  });
}

module.exports = { getWin, createWindow, registerWindowIpc };
