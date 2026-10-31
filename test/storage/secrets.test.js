const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { maskKey, describeKeyStorage } = require('../../src/storage/secrets');

const originalModuleLoad = Module._load;

function openStoreAt(dir) {
  Module._load = function loadWithElectronStub(request, parent, isMain) {
    if (request === 'electron') return { app: { getPath: () => dir } };
    return originalModuleLoad.call(this, request, parent, isMain);
  };
  delete require.cache[require.resolve('../../src/storage/store')];
  delete require.cache[require.resolve('../../src/storage/settings-store-core')];
  const store = require('../../src/storage/store');
  Module._load = originalModuleLoad;
  return store;
}

// Stands in for safeStorage: reversible, but the plaintext never appears in the file.
function fakeBackend({ available = true, weak = false, failDecrypt = false } = {}) {
  return {
    isAvailable: async () => available,
    isWeak: () => weak,
    encrypt: async (text) => Buffer.from(Buffer.from(text, 'utf8').toString('base64').split('').reverse().join('')),
    decrypt: async (buf) => {
      if (failDecrypt) throw new Error('key store locked');
      return Buffer.from(buf.toString().split('').reverse().join(''), 'base64').toString('utf8');
    }
  };
}

const OPENAI = 'sk-proj-abcdefghijklmnop1234';
const GEMINI = 'AIzaSyExampleKeyValue9876';

function profileWithKeys(keys) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onscreenly-secrets-'));
  fs.writeFileSync(path.join(dir, 'onscreenly-data.json'), JSON.stringify({ provider: 'openai', apiKeys: keys }));
  fs.writeFileSync(path.join(dir, 'onscreenly-data.json.bak'), JSON.stringify({ provider: 'openai', apiKeys: keys }));
  return dir;
}
const readJson = (dir, name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
const fileText = (dir, name) => fs.readFileSync(path.join(dir, name), 'utf8');

test('moves plaintext keys into the encrypted file and scrubs the settings file and its backup', async () => {
  const dir = profileWithKeys({ openai: OPENAI, gemini: GEMINI, ollama: 'http://localhost:11434' });
  const store = openStoreAt(dir);
  const status = await store.initSecureStorage(fakeBackend());
  assert.equal(status.mode, 'encrypted');
  assert.equal(status.protected, true);
  assert.equal(store.getSettings().apiKeys.openai, OPENAI, 'keys stay usable in memory');
  for (const name of ['onscreenly-data.json', 'onscreenly-data.json.bak']) {
    assert.doesNotMatch(fileText(dir, name), /sk-proj|AIzaSy|11434/, `${name} holds no keys`);
  }
  assert.doesNotMatch(fileText(dir, 'secrets.bin'), /sk-proj|AIzaSy/);

  const next = openStoreAt(dir);
  await next.initSecureStorage(fakeBackend());
  assert.equal(next.getSettings().apiKeys.openai, OPENAI, 'keys come back after a restart');
  assert.equal(next.getSettings().apiKeys.gemini, GEMINI);
  assert.equal(next.getSettings().apiKeys.ollama, 'http://localhost:11434');
});

test('a key saved later goes to the encrypted file, not the settings file', async () => {
  const dir = profileWithKeys({});
  const store = openStoreAt(dir);
  await store.initSecureStorage(fakeBackend());
  store.setSettings({ apiKeys: { anthropic: 'sk-ant-api03-secretvalue' } });
  await store.flushSecrets();
  assert.doesNotMatch(fileText(dir, 'onscreenly-data.json'), /sk-ant/);
  assert.equal(readJson(dir, 'onscreenly-data.json').apiKeys.anthropic, '');
  const next = openStoreAt(dir);
  await next.initSecureStorage(fakeBackend());
  assert.equal(next.getSettings().apiKeys.anthropic, 'sk-ant-api03-secretvalue');
});

test('the window sees saved keys only as a mask, and sending the mask back keeps the key', async () => {
  const dir = profileWithKeys({ openai: OPENAI, ollama: 'http://localhost:11434' });
  const store = openStoreAt(dir);
  await store.initSecureStorage(fakeBackend());
  const view = store.redactForRenderer(store.getSettings());
  assert.equal(view.apiKeys.openai, maskKey(OPENAI));
  assert.match(view.apiKeys.openai, /1234$/);
  assert.doesNotMatch(JSON.stringify(view), /sk-proj/);
  assert.equal(view.apiKeys.ollama, 'http://localhost:11434', 'the Ollama URL is not a secret');

  store.setSettings(store.stripRendererPatch({ ...view, provider: 'openai' }));
  assert.equal(store.getSettings().apiKeys.openai, OPENAI, 'unchanged mask keeps the key');
  store.setSettings(store.stripRendererPatch({ apiKeys: { openai: 'sk-new-key-0000000000' } }));
  assert.equal(store.getSettings().apiKeys.openai, 'sk-new-key-0000000000', 'a typed key replaces it');
  store.setSettings(store.stripRendererPatch({ apiKeys: { openai: '' } }));
  assert.equal(store.getSettings().apiKeys.openai, '', 'clearing the field removes it');
});

test('without encryption the keys stay in the settings file, with a warning', async () => {
  const dir = profileWithKeys({ openai: OPENAI });
  const store = openStoreAt(dir);
  const status = await store.initSecureStorage(fakeBackend({ available: false }));
  assert.equal(status.mode, 'unavailable');
  assert.equal(status.protected, false);
  assert.match(status.message, /plain text/);
  assert.equal(readJson(dir, 'onscreenly-data.json').apiKeys.openai, OPENAI, 'nothing is lost');
  assert.equal(fs.existsSync(path.join(dir, 'secrets.bin')), false);
});

test('a Linux fallback key store is reported as not protected', async () => {
  const dir = profileWithKeys({ openai: OPENAI });
  const store = openStoreAt(dir);
  const status = await store.initSecureStorage(fakeBackend({ weak: true }));
  assert.equal(status.mode, 'weak');
  assert.equal(status.protected, false);
  assert.match(status.message, /keyring/);
});

test('an undecryptable key file is kept until the user saves a new key', async () => {
  const dir = profileWithKeys({ openai: OPENAI });
  await openStoreAt(dir).initSecureStorage(fakeBackend());
  const encrypted = fs.readFileSync(path.join(dir, 'secrets.bin'));

  const store = openStoreAt(dir);
  const status = await store.initSecureStorage(fakeBackend({ failDecrypt: true }));
  assert.equal(status.mode, 'unreadable');
  store.setSettings({ opacity: 0.8 });
  await store.flushSecrets();
  assert.deepEqual(fs.readFileSync(path.join(dir, 'secrets.bin')), encrypted, 'not overwritten by an unrelated save');
});

test('deleting local settings removes the settings file, its backup and the encrypted keys', async () => {
  const dir = profileWithKeys({ openai: OPENAI });
  const store = openStoreAt(dir);
  await store.initSecureStorage(fakeBackend());
  await store.deleteLocalSettings();
  for (const name of ['onscreenly-data.json', 'onscreenly-data.json.bak', 'secrets.bin']) {
    assert.equal(fs.existsSync(path.join(dir, name)), false, name);
  }
});

test('masks show at most the last four characters', () => {
  assert.equal(maskKey(''), '');
  assert.equal(maskKey('short'), '••••••••');
  assert.equal(maskKey(OPENAI), '••••••••1234');
  assert.equal(describeKeyStorage('encrypted', 'darwin').message, 'API keys are encrypted with macOS Keychain.');
});

test('a failed encrypted write keeps the key out of the settings file and is reported until a write succeeds', async () => {
  const dir = profileWithKeys({});
  const store = openStoreAt(dir);
  const backend = fakeBackend();
  await store.initSecureStorage(backend);
  const encrypt = backend.encrypt;
  backend.encrypt = async () => {
    throw new Error('key store busy');
  };
  store.setSettings({ apiKeys: { anthropic: 'sk-ant-api03-secretvalue' } });
  await store.flushSecrets();
  assert.match(String(store.secretsSaveError()), /key store busy/);
  assert.equal(store.keyStorageStatus().mode, 'encrypted', 'storage is not downgraded to plain text');
  for (const name of ['onscreenly-data.json', 'onscreenly-data.json.bak']) {
    assert.doesNotMatch(fileText(dir, name), /sk-ant/, `${name} holds no key`);
  }
  assert.equal(store.getSettings().apiKeys.anthropic, 'sk-ant-api03-secretvalue', 'the key still works this session');

  backend.encrypt = encrypt;
  store.setSettings({ smart: true });
  await store.flushSecrets();
  assert.equal(store.secretsSaveError(), null, 'the next save retries and clears the error');
  const next = openStoreAt(dir);
  await next.initSecureStorage(fakeBackend());
  assert.equal(next.getSettings().apiKeys.anthropic, 'sk-ant-api03-secretvalue');
});
