const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { APP_ID, PRODUCT_NAME } = require('../../src/platform/app-identity');
const builder = require('../../electron-builder.cjs');
const pkg = require('../../package.json');
const lock = require('../../package-lock.json');
const read = (name) => fs.readFileSync(path.join(__dirname, '..', '..', name), 'utf8');

test('package, lock, installers and local app-link use a consistent Onscreenly identity', () => {
  assert.equal(pkg.name, 'onscreenly');
  assert.equal(lock.name, pkg.name);
  assert.equal(lock.packages[''].name, pkg.name);
  assert.equal(lock.packages[''].hasInstallScript, undefined);
  assert.equal(pkg.scripts.postinstall, undefined);
  assert.equal(builder.appId, APP_ID);
  assert.equal(builder.productName, PRODUCT_NAME);
  assert.equal(builder.nsis.shortcutName, PRODUCT_NAME);
  assert.match(read('src/integrations/applink.js'), /appId: 'com\.onscreenly\.overlay'/);
  assert.match(read('src/integrations/applink.js'), /appSlug: 'onscreenly'/);
  assert.equal(pkg.license, 'GPL-3.0-or-later');
  assert.equal(pkg.author, 'Lohith Kumar <lkneerukonda@gmail.com>');
  assert.ok(
    pkg.contributors.some((c) => c.includes('Cue contributors')),
    'retain upstream attribution'
  );
  assert.match(read('NOTICE'), /Cue \(https:\/\/github\.com\/Blueturboguy07\/cue\)/);
});

test('both preload names retain the same IPC API and event allowlist', async () => {
  const exposed = {};
  const calls = [];
  const listeners = [];
  const ipcRenderer = {
    invoke: async (...args) => {
      calls.push(args);
      return true;
    },
    send: (...args) => calls.push(args),
    on: (name, callback) => listeners.push([name, callback])
  };
  vm.runInNewContext(read('preload.js'), {
    require: () => ({
      contextBridge: {
        exposeInMainWorld: (name, api) => {
          exposed[name] = api;
        }
      },
      ipcRenderer
    }),
    process: { platform: 'darwin' },
    console
  });
  assert.equal(exposed.onscreenly, exposed.cue);
  await exposed.onscreenly.captureToggle();
  await exposed.cue.captureToggle();
  assert.deepEqual(calls, [['capture:toggle'], ['capture:toggle']]);
  exposed.onscreenly.on('arbitrary-channel', () => {});
  assert.equal(listeners.length, 0);
  let received;
  exposed.onscreenly.on('capture:state', (data) => {
    received = data;
  });
  listeners[0][1]({}, { active: true });
  assert.deepEqual(received, { active: true });
});

test('the renamed AudioWorklet is registered under the name used by both audio channels', () => {
  const names = [];
  vm.runInNewContext(read('renderer/audio-worklet-processor.js'), {
    AudioWorkletProcessor: class {},
    registerProcessor: (name) => names.push(name)
  });
  assert.deepEqual(names, ['onscreenly-audio-processor']);
  const consumers = [...read('renderer/js/audio.js').matchAll(/new AudioWorkletNode\([^,]+, '([^']+)'\)/g)];
  assert.equal(consumers.length, 2);
  assert.ok(consumers.every((match) => names.includes(match[1])));
});

test('visible entry points and retired setup scripts do not impersonate another product', () => {
  assert.match(read('renderer/index.html'), /<title>Onscreenly<\/title>/);
  assert.match(read('renderer/permissions.html'), /<title>Onscreenly/);
  for (const name of fs.readdirSync(path.join(__dirname, '..', '..', 'app', 'main'))) {
    assert.doesNotMatch(read(`app/main/${name}`), /set(?:Title|Name)\(['"]Microsoft/);
  }
  for (const name of ['rename-electron', 'apply-icon', 'build-icon']) {
    const source = read(`scripts/${name}.js`);
    assert.doesNotMatch(source, /writeFile|copyFile|unlink|resedit|Microsoft Corporation/);
  }
});
