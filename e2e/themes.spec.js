// The light workspace: Settings, onboarding and the permissions window keep the
// redesign's colours and fonts.
const { test, expect } = require('./fixtures');
const { appWindow } = require('./helpers');

// Ids of every element whose computed font is EB Garamond.
const garamondIds = (page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('body *'))
      .filter((el) => /Garamond/.test(getComputedStyle(el).fontFamily))
      .map((el) => el.id || el.className)
  );

test('Settings is a flat white sheet with a blue tab underline and one primary action per pane', async ({ launch }) => {
  const { page } = await launch();
  await page.click('#tb-settings-btn');
  const sheet = await page.locator('#settings').evaluate((el) => {
    const style = getComputedStyle(el);
    return { background: style.backgroundColor, border: style.borderTopColor, shadow: style.boxShadow };
  });
  expect(sheet).toEqual({ background: 'rgb(255, 255, 255)', border: 'rgb(228, 228, 231)', shadow: 'none' });
  const underline = await page.locator('.s-tab.on').evaluate((el) => getComputedStyle(el, '::after').backgroundColor);
  expect(underline).toBe('rgb(60, 131, 246)');

  const tabs = await page.locator('.s-tab').evaluateAll((els) => els.map((el) => el.dataset.tab));
  for (const tab of tabs) {
    await page.click(`.s-tab[data-tab="${tab}"]`);
    const pane = page.locator(`.s-tab-pane[data-pane="${tab}"]`);
    await expect(pane).toBeVisible();
    const primaries = await pane
      .locator('.btn-primary')
      .evaluateAll((els) => els.filter((el) => el.getClientRects().length).length);
    expect(primaries, `visible primary buttons on ${tab}`).toBeLessThanOrEqual(1);
  }
});

test('onboarding sets only the welcome title in EB Garamond', async ({ launch }) => {
  const { page } = await launch({ settings: { onboarded: false } });
  await expect(page.locator('#onboard')).toBeVisible();
  const loaded = await page.evaluate(async () => (await document.fonts.load('400 32px "EB Garamond"')).length);
  expect(loaded).toBeGreaterThan(0);
  expect(await garamondIds(page)).toEqual(['ob-title']);
  await page.click('#ob-next');
  await expect(page.locator('#ob-count')).toHaveText(/Step 2/);
  expect(await garamondIds(page)).toEqual([]);
});

test('the permissions window shows the light card with Check again and Continue', async ({ launch }) => {
  const { app } = await launch({ env: { ONSCREENLY_E2E_PERMISSIONS_WINDOW: '1' } });
  const perm = await appWindow(app, 'permissions.html');
  await perm.waitForLoadState();
  const card = perm.locator('.perm-card');
  await expect(card).toBeVisible();
  expect(await card.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');
  await expect(perm.locator('#check-btn')).toHaveText('Check again');
  await expect(perm.locator('#continue-btn')).toHaveText('Continue');
  await expect(perm.locator('#check-btn')).toBeVisible();
  await expect(perm.locator('#continue-btn')).toBeVisible();
});
