const { test, expect } = require('./fixtures');
const { closeSettings } = require('./helpers');

test('the overlay starts sandboxed and without errors, and every Settings tab opens', async ({ launch }) => {
  const { app, page } = await launch();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await expect(page.locator('#toolbar')).toBeVisible();
  const windows = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((win) => {
      const prefs = win.webContents.getLastWebPreferences();
      return {
        sandbox: prefs.sandbox,
        contextIsolation: prefs.contextIsolation,
        nodeIntegration: prefs.nodeIntegration
      };
    })
  );
  expect(windows.length).toBeGreaterThan(0);
  for (const prefs of windows) expect(prefs).toEqual({ sandbox: true, contextIsolation: true, nodeIntegration: false });

  await page.click('#tb-settings-btn');
  const tabs = await page.locator('.s-tab').evaluateAll((els) => els.map((el) => el.dataset.tab));
  expect(tabs).toEqual(['keys', 'profile', 'knowledge', 'transcription', 'style', 'appearance']);
  for (const tab of tabs) {
    await page.click(`.s-tab[data-tab="${tab}"]`);
    await expect(page.locator(`.s-tab-pane[data-pane="${tab}"]`)).toBeVisible();
  }
  await closeSettings(page);
  expect(errors).toEqual([]);
});
