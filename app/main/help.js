// Help: "Report a problem" (a pre-filled GitHub issue) and the notice that a newer release exists.
const os = require('os');
const { app, net, shell } = require('electron');
const store = require('../../src/storage/store');
const { LATEST_RELEASE_API, RELEASES_URL, problemReportUrl } = require('../../src/help/project-links');
const { checkForUpdate } = require('../../src/help/updates');
const { on } = require('./ipc-guard');
const { send } = require('./session');
// The version in package.json (always packaged): app.getVersion() reads the entry script's
// package, which under the app tests' launcher is not Onscreenly's.
const { version: APP_VERSION } = require('../../package.json');

function registerHelpIpc() {
  on('help:report-problem', () => {
    const url = problemReportUrl({
      version: APP_VERSION,
      platform: process.platform,
      // The version people know: macOS 15.1.0 or Windows 10.0.22631, not the Darwin kernel's 24.1.0.
      release: process.platform === 'linux' ? os.release() : process.getSystemVersion(),
      arch: process.arch,
      electron: process.versions.electron
    });
    shell.openExternal(url).catch(() => {});
  });
  on('help:open-releases', () => {
    shell.openExternal(RELEASES_URL).catch(() => {});
  });
}

/**
 * Once per launch, after the overlay has loaded: if Settings allows it, ask GitHub whether a newer
 * release exists and, if so, say so. Only the installed app checks; a development run does not,
 * unless the app tests point it at their own server (ONSCREENLY_UPDATE_URL, ignored when packaged).
 */
function checkForUpdateWhenLoaded(win) {
  const testUrl = !app.isPackaged ? process.env.ONSCREENLY_UPDATE_URL : '';
  if (!app.isPackaged && !testUrl) return;
  win.webContents.once('did-finish-load', async () => {
    if (store.getSettings().checkForUpdates === false) return;
    const found = await checkForUpdate({
      current: APP_VERSION,
      url: testUrl || LATEST_RELEASE_API,
      fetchImpl: (url, init) => net.fetch(url, init)
    });
    if (found && !win.isDestroyed()) send('update:available', found);
  });
}

module.exports = { registerHelpIpc, checkForUpdateWhenLoaded };
