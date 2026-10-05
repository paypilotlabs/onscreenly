const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const {
  isTrustedPageUrl,
  isAllowedPaneUrl,
  isValidSettingsPatch,
  isValidAskPayload,
  isValidPcmChunk,
  MAX_ASK_TEXT_CHARS,
  MAX_PCM_BYTES
} = require('../../app/main/ipc-policy');

const RENDERER_DIR = path.join(__dirname, '..', '..', 'renderer');
const pageUrl = (name) => pathToFileURL(path.join(RENDERER_DIR, name)).href;

test('only the overlay and permission pages inside renderer/ are trusted', () => {
  assert.equal(isTrustedPageUrl(pageUrl('index.html'), RENDERER_DIR), true);
  assert.equal(isTrustedPageUrl(pageUrl('permissions.html'), RENDERER_DIR), true);
  assert.equal(isTrustedPageUrl(pageUrl('icons.js'), RENDERER_DIR), false);
  assert.equal(isTrustedPageUrl(pageUrl('js/main.js'), RENDERER_DIR), false);
  assert.equal(isTrustedPageUrl(pathToFileURL(path.join(RENDERER_DIR, '..', 'index.html')).href, RENDERER_DIR), false);
  assert.equal(isTrustedPageUrl(pageUrl('index.html') + '?x=1', RENDERER_DIR), false);
  assert.equal(isTrustedPageUrl(pageUrl('index.html') + '#frag', RENDERER_DIR), false);
  assert.equal(isTrustedPageUrl('https://example.com/index.html', RENDERER_DIR), false);
  assert.equal(isTrustedPageUrl('about:blank', RENDERER_DIR), false);
  assert.equal(isTrustedPageUrl('', RENDERER_DIR), false);
  assert.equal(isTrustedPageUrl('not a url', RENDERER_DIR), false);
});

test('open-pane only reaches the OS privacy panes the app links to', () => {
  for (const url of [
    'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
    'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
    'ms-settings:privacy-microphone',
    'ms-settings:privacy-screenrecorder',
    'ms-settings:privacy'
  ]) {
    assert.equal(isAllowedPaneUrl(url), true, url);
  }
  for (const url of [
    'https://example.com',
    'file:///etc/passwd',
    'smb://attacker/share',
    'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone&x=../../',
    'ms-settings:privacy-microphone foo',
    'ms-settings:display',
    'javascript:alert(1)',
    42,
    null
  ]) {
    assert.equal(isAllowedPaneUrl(url), false, String(url));
  }
});

test('settings patches must be plain objects of a sensible size', () => {
  assert.equal(isValidSettingsPatch({ provider: 'openai', apiKeys: { openai: 'sk-x' } }), true);
  assert.equal(isValidSettingsPatch(null), false);
  assert.equal(isValidSettingsPatch([]), false);
  assert.equal(isValidSettingsPatch('provider=openai'), false);
  assert.equal(isValidSettingsPatch({ resumeText: 'x'.repeat(3 * 1024 * 1024) }), false);
});

test('ask payloads need a known mode and bounded text', () => {
  const modes = { ask: {}, say: {} };
  assert.equal(isValidAskPayload({ mode: 'ask', text: 'What is a closure?' }), false, 'modes are required');
  assert.equal(isValidAskPayload({ mode: 'ask', text: 'What is a closure?' }, modes), true);
  assert.equal(isValidAskPayload({ mode: 'say', text: '' }, modes), true);
  assert.equal(isValidAskPayload({ mode: 'say' }, modes), true);
  assert.equal(isValidAskPayload({ mode: 'toString', text: '' }, modes), false);
  assert.equal(isValidAskPayload({ mode: 'unknown', text: '' }, modes), false);
  assert.equal(isValidAskPayload({ mode: 'ask', text: 'x'.repeat(MAX_ASK_TEXT_CHARS + 1) }, modes), false);
  assert.equal(isValidAskPayload({ mode: 'ask', text: { evil: true } }, modes), false);
  assert.equal(isValidAskPayload(null, modes), false);
});

test('PCM chunks must be binary and bounded', () => {
  assert.equal(isValidPcmChunk(new ArrayBuffer(3200)), true);
  assert.equal(isValidPcmChunk(new Int16Array(1600)), true);
  assert.equal(isValidPcmChunk(new ArrayBuffer(MAX_PCM_BYTES + 1)), false);
  assert.equal(isValidPcmChunk('not audio'), false);
  assert.equal(isValidPcmChunk([1, 2, 3]), false);
  assert.equal(isValidPcmChunk(null), false);
});

test('main-process modules register IPC only through the sender guard', () => {
  const mainDir = path.join(__dirname, '..', '..', 'app', 'main');
  for (const name of fs.readdirSync(mainDir)) {
    if (name === 'ipc-guard.js') continue;
    const source = fs.readFileSync(path.join(mainDir, name), 'utf8');
    assert.doesNotMatch(source, /ipcMain\.(handle|on|once|handleOnce)\(/, `${name} registers IPC directly`);
  }
});

test('every window refuses navigation, new windows and webviews', () => {
  const index = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'main', 'index.js'), 'utf8');
  assert.match(index, /setWindowOpenHandler\(\(\) => \(\{ action: 'deny' \}\)\)/);
  assert.match(index, /'will-navigate', \(event\) => event\.preventDefault\(\)/);
  assert.match(index, /'will-attach-webview', \(event\) => event\.preventDefault\(\)/);
});

test('both windows run sandboxed with context isolation', () => {
  for (const name of ['window.js', 'permissions.js']) {
    const source = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'main', name), 'utf8');
    assert.match(source, /contextIsolation: true/, name);
    assert.match(source, /nodeIntegration: false/, name);
    assert.match(source, /sandbox: true/, name);
  }
});
