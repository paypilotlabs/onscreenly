// Screenshots of the main states for review (test-results/ui/*.png, uploaded by
// CI). Nothing here compares pixels; the other specs check behaviour.
const path = require('node:path');
const { test, expect } = require('./fixtures');
const { ROOT, appWindow, startMockProvider } = require('./helpers');
const { consentCopy } = require('../src/integrations/applink-state');

const OUT = path.join(ROOT, 'test-results', 'ui');
// The test runner has no screen to capture, so Assist reports that in a banner; real use has none.
async function dismissBanner(page) {
  const banner = page.locator('#onscreenly-status');
  if (await banner.isVisible()) await banner.locator('.banner-close').click();
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`), animations: 'disabled' });

test('overlay, Settings and consent', async ({ launch }) => {
  let failing = false;
  const answer = 'Paris is the capital of France.\n\n- It has been since 987.\n- About 2.1 million people live there.';
  const mock = await startMockProvider(() => answer, { status: () => (failing ? 500 : 200) });
  try {
    const { app, page } = await launch({ settings: { ...mock.settings, sttProvider: 'custom' } });
    await expect(page.locator('.es-ready')).toBeVisible();
    await shot(page, 'overlay-ready');

    await page.fill('#input', 'What is the capital of France?');
    await page.press('#input', 'Enter');
    await expect(page.locator('#messages')).toContainText('2.1 million');
    await dismissBanner(page);
    await shot(page, 'overlay-answer');

    failing = true;
    await page.fill('#input', 'And of Spain?');
    await page.press('#input', 'Enter');
    await expect(page.locator('.ai-fix').last()).toHaveText('Try again');
    await dismissBanner(page);
    await shot(page, 'overlay-error');

    await page.click('#history-btn');
    await expect(page.locator('#transcript-sidebar')).toHaveClass(/\bopen\b/);
    await shot(page, 'overlay-transcript');
    await page.click('#history-btn');

    await page.click('#tb-settings-btn');
    for (const [tab, name] of [
      ['keys', 'settings-keys'],
      ['profile', 'settings-profile'],
      ['transcription', 'settings-audio']
    ]) {
      await page.click(`.s-tab[data-tab="${tab}"]`);
      await expect(page.locator(`.s-tab-pane[data-pane="${tab}"]`)).toBeVisible();
      await shot(page, name);
    }
    await page.click('#s-close');
    await expect(page.locator('#settings-scrim')).toBeHidden();

    // The copy main would send for a signed app asking to read the status.
    const copy = consentCopy({ verification: 'code-signature', callerName: 'Meeting Notes', scope: 'status' });
    await app.evaluate(
      ({ BrowserWindow }, request) => {
        const win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('/renderer/index.html'));
        win.webContents.send('applink:consent-request', request);
      },
      { id: 'screens', ...copy }
    );
    await expect(page.locator('#consent')).toBeVisible();
    await shot(page, 'consent');
  } finally {
    await mock.close();
  }
});

test('setup state and the permissions window', async ({ launch }) => {
  const { app, page } = await launch({ env: { ONSCREENLY_E2E_PERMISSIONS_WINDOW: '1' } });
  await expect(page.locator('.es-setup')).toBeVisible();
  await shot(page, 'overlay-setup');
  const perm = await appWindow(app, 'permissions.html');
  await expect(perm.locator('#continue-btn')).toBeVisible();
  await shot(perm, 'permissions');
});

test('onboarding welcome and last step', async ({ launch }) => {
  const { page } = await launch({ settings: { onboarded: false } });
  await expect(page.locator('#onboard')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await shot(page, 'onboarding-welcome');
  await page.click('#ob-next');
  await page.click('#ob-next');
  await page.locator('#ob-buttons button', { hasText: 'Open Settings' }).click();
  await page.click('#s-close');
  await expect(page.locator('#ob-title')).toHaveText('You’re all set');
  await shot(page, 'onboarding-done');
});
