// App lifecycle: one copy per profile, quitting after the permissions window is closed by hand,
// and Settings never moving the user off a keyless provider.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electronPath = require('electron');
const { test, expect } = require('./fixtures');
const { ROOT, appWindow, closeSettings } = require('./helpers');

function exitOf(child, timeout) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve('still running'), timeout);
    child.once('exit', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

test('a second launch on the same profile hands over and exits', async ({ launch }) => {
  const { app, profile } = await launch();
  const args = [path.join(__dirname, 'launch.cjs')];
  if (process.platform === 'linux') args.push('--no-sandbox');
  const second = spawn(electronPath, args, {
    cwd: ROOT,
    env: { ...process.env, ONSCREENLY_E2E_PROFILE: profile },
    stdio: 'ignore'
  });
  const code = await exitOf(second, 20000);
  if (code === 'still running') second.kill();
  expect(code).toBe(0);
  expect(app.windows().filter((w) => w.url().endsWith('/renderer/index.html'))).toHaveLength(1);
});

test('closing the permissions window by hand still lets the app quit', async ({ launch }) => {
  const { app } = await launch({ env: { ONSCREENLY_E2E_PERMISSIONS_WINDOW: '1' } });
  await appWindow(app, 'permissions.html');
  const exited = new Promise((resolve) => app.process().once('exit', () => resolve(true)));
  const closeWindow = (name) =>
    app.evaluate(({ BrowserWindow }, file) => {
      const win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith(`/${file}`));
      win.close();
    }, name);
  await closeWindow('permissions.html');
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
  closeWindow('index.html').catch(() => {}); // the process may exit before the call returns
  expect(await Promise.race([exited, new Promise((r) => setTimeout(() => r(false), 15000))])).toBe(true);
});

test('saving Settings keeps Ollama selected even when another provider has a key', async ({ launch }) => {
  const { page, profile } = await launch({
    settings: { provider: 'ollama', apiKeys: { openai: 'sk-synthetic-0000' } }
  });
  await page.click('#tb-settings-btn');
  await expect(page.locator('#settings')).toBeVisible();
  await closeSettings(page);
  const saved = JSON.parse(fs.readFileSync(path.join(profile, 'onscreenly-data.json'), 'utf8'));
  expect(saved.provider).toBe('ollama');
});
