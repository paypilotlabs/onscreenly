// Shared setup for the app tests: launch the real Electron app on a fresh
// profile, a stand-in OpenAI-compatible provider, and small file fixtures.
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { _electron: electron } = require('@playwright/test');

const ROOT = path.join(__dirname, '..');

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `onscreenly-e2e-${prefix}-`));
}

/**
 * Starts the app. `settings` seeds the settings file of a new profile; pass
 * `profile` to start again on an existing one. `env` adds variables such as
 * the hooks in launch.cjs.
 */
async function launchApp({ settings, profile, env } = {}) {
  const dir = profile || tempDir('profile');
  const file = path.join(dir, 'onscreenly-data.json');
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify({ onboarded: true, ...(settings || {}) }));
  const args = [path.join(__dirname, 'launch.cjs')];
  // Ubuntu runners block the unprivileged namespaces Chromium's OS sandbox
  // needs. The renderer sandbox (sandbox: true) still applies.
  if (process.platform === 'linux') args.push('--no-sandbox');
  const app = await electron.launch({
    args,
    cwd: ROOT,
    env: { ...process.env, ...env, ONSCREENLY_E2E_PROFILE: dir },
    timeout: 90000
  });
  const page = await app.firstWindow();
  await page.waitForSelector('#toolbar');
  return { app, page, profile: dir };
}

/** The app's window showing renderer/<file>, once it has opened and loaded that page. */
async function appWindow(app, file, timeout = 30000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const win = app.windows().find((w) => w.url().endsWith(`/renderer/${file}`));
    if (win) return win;
    if (Date.now() > deadline) throw new Error(`No window opened renderer/${file}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/**
 * The errors launch.cjs recorded for this profile's windows: console errors
 * and failed loads. A clean run leaves none.
 */
function consoleErrors(profile) {
  const file = path.join(profile, 'console.log');
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean) : [];
}

/**
 * A local OpenAI-compatible chat endpoint that streams `reply(request)` back
 * and records every request it receives. `status` (a number, or a function of
 * the request's 1-based number) makes it fail with that HTTP status instead.
 */
async function startMockProvider(reply, { status = 200 } = {}) {
  const requests = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const json = JSON.parse(body || '{}');
      requests.push(json);
      const code = typeof status === 'function' ? status(requests.length) : status;
      if (code !== 200) {
        res.writeHead(code, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'Mock provider error', type: 'server_error' } }));
        return;
      }
      const text = reply(json);
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      const chunk = (delta, finish) =>
        'data: ' +
        JSON.stringify({
          id: 'mock',
          object: 'chat.completion.chunk',
          created: 1,
          model: 'mock',
          choices: [{ index: 0, delta, finish_reason: finish }]
        }) +
        '\n\n';
      for (const piece of text.match(/[\s\S]{1,40}/g) || []) res.write(chunk({ content: piece }, null));
      res.write(chunk({}, 'stop'));
      res.end('data: [DONE]\n\n');
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
  return {
    requests,
    settings: {
      provider: 'custom',
      baseUrl: `http://127.0.0.1:${port}/v1`,
      apiKeys: { custom: 'sk-e2e-mock-0000' },
      models: { custom: { fast: 'mock', smart: 'mock' } }
    },
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

function systemPrompt(request) {
  const message = (request.messages || []).find((m) => m.role === 'system');
  return message ? String(message.content) : '';
}

function userPrompt(request) {
  const message = (request.messages || []).find((m) => m.role === 'user');
  if (!message) return '';
  return typeof message.content === 'string' ? message.content : message.content.map((p) => p.text || '').join('');
}

/** Writes files under a new folder and returns its path. */
function makeFolder(prefix, files) {
  const dir = tempDir(prefix);
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), body);
  }
  return dir;
}

/** Makes the next file and folder dialogs answer with these paths. */
async function stubDialogs(app, { openFile, openFolder, saveFile } = {}) {
  await app.evaluate(
    ({ dialog }, paths) => {
      dialog.showOpenDialog = async (_win, options) => ({
        canceled: false,
        filePaths: [options.properties.includes('openDirectory') ? paths.openFolder : paths.openFile]
      });
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: paths.saveFile });
    },
    { openFile, openFolder, saveFile }
  );
}

async function openSettingsTab(page, tab) {
  if (await page.locator('#settings-scrim').isHidden()) await page.click('#tb-settings-btn');
  await page.click(`.s-tab[data-tab="${tab}"]`);
  await page.locator(`.s-tab-pane[data-pane="${tab}"]`).waitFor({ state: 'visible' });
}

async function closeSettings(page) {
  await page.click('#s-close');
  await page.locator('#settings-scrim').waitFor({ state: 'hidden' });
}

module.exports = {
  ROOT,
  appWindow,
  closeSettings,
  consoleErrors,
  launchApp,
  makeFolder,
  openSettingsTab,
  startMockProvider,
  stubDialogs,
  systemPrompt,
  tempDir,
  userPrompt
};
