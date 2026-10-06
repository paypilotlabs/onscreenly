// Electron entry for the app tests: the real app, started with a throwaway
// profile and with the parts a CI runner cannot provide stubbed out (OS
// permission prompts, screen sources, global shortcuts, app-link, Publik).
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
require(path.join(root, 'app/main/index.js'));
