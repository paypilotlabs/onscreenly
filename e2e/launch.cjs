// Electron entry for the app tests: the real app, started with a throwaway
// profile and with the parts a CI runner cannot provide stubbed out (OS
// permission prompts, screen sources, global shortcuts, app-link, Publik).
// Every window's console errors and failed loads go to <profile>/console.log,
// which the test helpers expect to be empty when a test ends.
const fs = require('node:fs');
const path = require('node:path');
const { app, systemPreferences, desktopCapturer, globalShortcut } = require('electron');

const profile = process.env.ONSCREENLY_E2E_PROFILE;
if (!profile) throw new Error('ONSCREENLY_E2E_PROFILE is not set');
fs.mkdirSync(path.join(profile, 'appdata'), { recursive: true });
app.setPath('appData', path.join(profile, 'appdata'));
app.setPath('userData', profile);
app.setPath('sessionData', profile);

systemPreferences.getMediaAccessStatus = () => 'granted';
systemPreferences.askForMediaAccess = async () => true;
desktopCapturer.getSources = async () => [];
globalShortcut.register = () => true;
globalShortcut.unregisterAll = () => {};

const root = path.join(__dirname, '..');
require(path.join(root, 'src/integrations/applink')).startAppLink = () => null;
require(path.join(root, 'src/integrations/publik')).loadBuildConfig = () => ({
  available: false,
  appToken: '',
  disclosureVersion: 1
});

// From the moment each window exists, so errors during its first load count too
// (a blocked font, stylesheet or @import, a CSP violation).
const consoleLog = path.join(profile, 'console.log');
const record = (line) => fs.appendFileSync(consoleLog, line + '\n');
let firstWindow = true;
app.on('browser-window-created', (_event, win) => {
  const contents = win.webContents;
  contents.on('console-message', (event, legacyLevel, legacyMessage) => {
    // Only the app's own pages: a test may open a foreign page (security.spec) to provoke errors.
    if (!contents.getURL().startsWith('file:')) return;
    const level = event.level !== undefined ? event.level : legacyLevel;
    if (level === 'error' || level === 3) record(`console error: ${event.message || legacyMessage}`);
  });
  contents.on('did-fail-load', (_e, code, description, url) => {
    // -3 is an aborted load: a navigation the app itself cancelled, not a failure.
    if (code !== -3) record(`did-fail-load ${code} ${description}: ${url}`);
  });
  // ONSCREENLY_E2E_PERMISSIONS_WINDOW=1 opens the permissions window once, after the overlay loads.
  if (firstWindow && process.env.ONSCREENLY_E2E_PERMISSIONS_WINDOW === '1') {
    contents.once('did-finish-load', () => {
      require(path.join(root, 'app/main/permissions.js')).createPermissionsWindow();
    });
  }
  firstWindow = false;
});

require(path.join(root, 'app/main/index.js'));
