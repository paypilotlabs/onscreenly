const path = require('node:path');
const { test, expect } = require('./fixtures');
const { ROOT } = require('./helpers');

test('the overlay cannot navigate away, open windows, or hand arbitrary URLs to the OS', async ({ launch }) => {
  const { app, page } = await launch();
  await app.evaluate(({ shell }) => {
    globalThis.__opened = [];
    shell.openExternal = async (url) => {
      globalThis.__opened.push(url);
    };
  });
  const start = page.url();

  expect(await page.evaluate(() => window.open('https://example.com') === null)).toBe(true);
  await page.evaluate(() => {
    location.href = 'https://example.com/';
  });
  await page.waitForTimeout(1000);
  expect(page.url()).toBe(start);

  await page.evaluate(() => {
    onscreenly.openPane('https://example.com/');
    onscreenly.openPane('file:///etc/passwd');
    onscreenly.openPane('x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone');
  });
  await expect
    .poll(() => app.evaluate(() => globalThis.__opened))
    .toEqual(['x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone']);
  expect(app.windows()).toHaveLength(1);
});

test('a page that is not Onscreenly gets nothing from the bridge, even with the same preload', async ({ launch }) => {
  const { app } = await launch();
  await app.evaluate(
    ({ BrowserWindow }, preload) => {
      const win = new BrowserWindow({
        show: false,
        webPreferences: { preload, sandbox: true, contextIsolation: true }
      });
      win.loadURL('data:text/html,<title>foreign</title><p>not Onscreenly</p>');
    },
    path.join(ROOT, 'preload.js')
  );
  const foreign = await app.waitForEvent('window', { predicate: (win) => win.url().startsWith('data:') });
  await foreign.waitForLoadState();
  const attempt = (call) =>
    foreign.evaluate(
      (name) =>
        window.onscreenly[name]().then(
          () => 'allowed',
          () => 'refused'
        ),
      call
    );
  expect(await attempt('settingsGet')).toBe('refused');
  expect(await attempt('keyStorageStatus')).toBe('refused');
  expect(await attempt('knowledgeStatus')).toBe('refused');
  // captureToggle reports failure as false; the overlay confirms nothing started.
  expect(await foreign.evaluate(() => window.onscreenly.captureToggle())).toBe(false);
  const overlay = app.windows().find((win) => win.url().endsWith('/renderer/index.html'));
  expect(await overlay.evaluate(() => window.onscreenly.captureState())).toEqual({ active: false });
});
