const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { resolveProfileDirectory, resolveSettingsFilename, bootstrapIdentity } = require('../src/app-identity');
const { createFileStore } = require('../src/settings-store-core');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'onscreenly-identity-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (relative, value = '{}') => {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, value);
    return file;
  };
  const resolve = (overrides = {}) =>
    resolveProfileDirectory({
      appData: root,
      currentName: 'onscreenly',
      currentUserData: path.join(root, 'onscreenly'),
      ...overrides
    });
  return { root, write, resolve };
}

test('fresh installs use Onscreenly; profile selection does not create files', (t) => {
  const { root, resolve } = fixture(t);
  assert.equal(resolve(), path.join(root, 'Onscreenly'));
  assert.deepEqual(fs.readdirSync(root), []);
});

test('an empty new folder does not hide legacy settings, history, or models', (t) => {
  const { root, write, resolve } = fixture(t);
  fs.mkdirSync(path.join(root, 'Onscreenly'));
  const settings = write('cue/cue-data.json', '{"onboarded":true}');
  const history = write('cue/meetings.json', '[{"title":"Synthetic meeting"}]');
  const model = write('cue/whisper-models/fixture.bin', 'synthetic model');
  assert.equal(resolve(), path.join(root, 'cue'));
  assert.equal(resolve(), path.join(root, 'cue'), 'repeat launch selects the same profile');
  assert.equal(fs.readFileSync(settings, 'utf8'), '{"onboarded":true}');
  assert.equal(fs.readFileSync(history, 'utf8'), '[{"title":"Synthetic meeting"}]');
  assert.equal(fs.readFileSync(model, 'utf8'), 'synthetic model');
  assert.deepEqual(fs.readdirSync(path.join(root, 'Onscreenly')), []);
});

for (const marker of ['cue-data.json.bak', 'meetings.json', 'whisper-models/model.bin']) {
  test(`legacy profile is recognized by ${marker} alone`, (t) => {
    const { root, write, resolve } = fixture(t);
    write('cue/' + marker);
    assert.equal(resolve(), path.join(root, 'cue'));
  });
}

test('populated Onscreenly wins over legacy profiles without merging them', (t) => {
  const { root, write, resolve } = fixture(t);
  write('cue/cue-data.json');
  write('Onscreenly/onscreenly-data.json.bak');
  assert.equal(resolve(), path.join(root, 'Onscreenly'));
  assert.equal(fs.existsSync(path.join(root, 'Onscreenly/cue-data.json')), false);
});

test('legacy Cue and MicrosoftEdgeUpdate names require recognizable app data', (t) => {
  const { root, write, resolve } = fixture(t);
  write('MicrosoftEdgeUpdate/unrelated.json');
  assert.equal(resolve(), path.join(root, 'Onscreenly'));
  write('MicrosoftEdgeUpdate/cue-data.json');
  assert.equal(resolve(), path.join(root, 'MicrosoftEdgeUpdate'));
  write('Cue/cue-data.json');
  // APFS/NTFS can resolve both spellings to the same directory without
  // normalizing the casing returned by realpath.
  assert.equal(fs.statSync(resolve()).ino, fs.statSync(path.join(root, 'Cue')).ino);
  write('cue/cue-data.json');
  assert.equal(resolve(), path.join(root, 'cue'));
});

test('CLI and programmatic profile overrides win even when empty', (t) => {
  const { root, write, resolve } = fixture(t);
  write('cue/cue-data.json');
  const custom = path.join(root, 'custom');
  const cli = path.join(root, 'cli');
  assert.equal(resolve({ currentUserData: custom }), custom);
  assert.equal(resolve({ currentUserData: custom, commandLineUserData: cli }), cli);
});

test('bootstrap sets the name and path before a store is opened', (t) => {
  const { root, write } = fixture(t);
  write('cue/cue-data.json');
  const calls = [];
  const app = {
    getName: () => 'onscreenly',
    getPath: (name) => (name === 'appData' ? root : path.join(root, 'onscreenly')),
    commandLine: {
      getSwitchValue: (name) => {
        assert.equal(name, 'user-data-dir');
        return '';
      }
    },
    setName: (name) => calls.push(['name', name]),
    setPath: (name, value) => calls.push([name, value])
  };
  assert.equal(bootstrapIdentity(app), path.join(root, 'cue'));
  assert.deepEqual(calls, [
    ['name', 'Onscreenly'],
    ['userData', path.join(root, 'cue')]
  ]);
});

test('settings filename priority includes backup-only recovery', (t) => {
  const { root, write } = fixture(t);
  assert.equal(resolveSettingsFilename(root), 'onscreenly-data.json');
  write('cue-data.json.bak');
  assert.equal(resolveSettingsFilename(root), 'cue-data.json');
  write('onscreenly-data.json.bak');
  assert.equal(resolveSettingsFilename(root), 'onscreenly-data.json');
});

for (const corruptPrimary of [false, true]) {
  test(`legacy backup recovers and subsequent writes keep its filename (corrupt=${corruptPrimary})`, (t) => {
    const { root, write } = fixture(t);
    if (corruptPrimary) write('cue-data.json', '{broken');
    write('cue-data.json.bak', '{"onboarded":true}');
    const store = createFileStore(() => root, resolveSettingsFilename);
    assert.deepEqual(store.load(), { data: { onboarded: true }, recoveredFromBackup: true });
    store.persist({ onboarded: true, opacity: 0.8 });
    assert.equal(fs.existsSync(path.join(root, 'onscreenly-data.json')), false);
    const reopened = createFileStore(() => root, resolveSettingsFilename);
    assert.deepEqual(reopened.load().data, { onboarded: true, opacity: 0.8 });
  });
}

test('the application settings store reads and updates legacy preferences in place', (t) => {
  const { root, write } = fixture(t);
  write('cue-data.json', JSON.stringify({ onboarded: true, aiRules: 'Use concise sentences.', opacity: 0.7 }));
  const originalLoad = Module._load;
  Module._load = function (request, ...args) {
    return request === 'electron' ? { app: { getPath: () => root } } : originalLoad.call(this, request, ...args);
  };
  let settings;
  try {
    delete require.cache[require.resolve('../src/store')];
    settings = require('../src/store');
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve('../src/store')];
  }
  assert.equal(settings.getSettings().aiRules, 'Use concise sentences.');
  settings.setSettings({ opacity: 0.6 });
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'cue-data.json'), 'utf8')).opacity, 0.6);
  assert.equal(fs.existsSync(path.join(root, 'onscreenly-data.json')), false);
});
