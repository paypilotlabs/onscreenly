// @ts-check
// Resolve identity before any settings store or Electron session is opened.
// Reuse a legacy profile in place: never copy, merge, rename, or delete its data.
const fs = require('fs');
const path = require('path');

const PRODUCT_NAME = 'Onscreenly';
const APP_ID = 'com.onscreenly.overlay';
const SETTINGS_FILE = 'onscreenly-data.json';
const LEGACY_SETTINGS_FILE = 'cue-data.json';

function isFile(candidate) {
  try { return fs.statSync(candidate).isFile(); } catch (_) { return false; }
}

function hasProfileArtifacts(directory) {
  const files = [SETTINGS_FILE, SETTINGS_FILE + '.bak', LEGACY_SETTINGS_FILE,
    LEGACY_SETTINGS_FILE + '.bak', 'meetings.json', 'meetings.json.bak'];
  if (files.some((name) => isFile(path.join(directory, name)))) return true;
  try { return fs.statSync(path.join(directory, 'whisper-models')).isDirectory(); }
  catch (_) { return false; }
}

function resolveProfileDirectory({ appData, currentUserData, currentName, commandLineUserData }) {
  // A CLI or programmatic override always wins, even if it is empty of app data.
  if (commandLineUserData) return path.resolve(commandLineUserData);
  if (currentUserData && path.resolve(currentUserData) !== path.resolve(appData, currentName)) {
    return currentUserData;
  }
  const preferred = path.join(appData, PRODUCT_NAME);
  if (hasProfileArtifacts(preferred)) return preferred;
  for (const name of ['cue', 'Cue', 'MicrosoftEdgeUpdate']) {
    const candidate = path.join(appData, name);
    // A directory name alone is insufficient, particularly for the old disguise.
    if (hasProfileArtifacts(candidate)) return candidate;
  }
  return preferred;
}

function resolveSettingsFilename(directory) {
  for (const name of [SETTINGS_FILE, LEGACY_SETTINGS_FILE]) {
    if (isFile(path.join(directory, name)) || isFile(path.join(directory, name + '.bak'))) return name;
  }
  return SETTINGS_FILE;
}

function bootstrapIdentity(app) {
  // Capture paths BEFORE setName: Electron derives its default userData from name.
  const directory = resolveProfileDirectory({
    appData: app.getPath('appData'),
    currentUserData: app.getPath('userData'),
    currentName: app.getName(),
    commandLineUserData: app.commandLine.getSwitchValue('user-data-dir'),
  });
  fs.mkdirSync(directory, { recursive: true });
  app.setName(PRODUCT_NAME);
  app.setPath('userData', directory);
  return directory;
}

module.exports = { PRODUCT_NAME, APP_ID, SETTINGS_FILE, LEGACY_SETTINGS_FILE,
  hasProfileArtifacts, resolveProfileDirectory, resolveSettingsFilename, bootstrapIdentity };
