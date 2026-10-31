// The themes: Settings and the permissions window keep the light workspace, and the guide
// (onboarding, Help) is part of the dark overlay.
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

test('Help opens the guide in the answer panel’s place, dark like the overlay', async ({ launch }) => {
  const { page } = await launch();
  const panel = await page.locator('#panel').boundingBox();
  const panelColor = await page.locator('#panel').evaluate((el) => getComputedStyle(el).backgroundColor);
  await page.click('#logo-btn');
  await expect(page.locator('#onboard')).toBeVisible();
  // Measured once it has risen into place.
  await page.locator('#onboard').evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  const guide = await page.locator('#onboard').boundingBox();
  expect(Math.round(guide.x)).toBe(Math.round(panel.x));
  expect(Math.round(guide.y)).toBe(Math.round(panel.y));
  expect(Math.round(guide.width)).toBe(Math.round(panel.width));
  expect(guide.y + guide.height).toBeLessThanOrEqual(page.viewportSize() ? page.viewportSize().height : 600);
  expect(await page.locator('#onboard').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(panelColor);
  // Nothing behind it is dimmed or blurred; the panel steps aside and the toolbar stays in view.
  expect(await page.locator('#onboard-scrim').evaluate((el) => getComputedStyle(el).backdropFilter)).toBe('none');
  await expect(page.locator('#panel-wrap')).toBeHidden();
  await expect(page.locator('#toolbar')).toBeVisible();
  expect(await garamondIds(page)).toEqual([]);
  // Every step fits without scrolling its body.
  for (let step = 1; step <= 4; step++) {
    const body = await page.locator('#ob-body').evaluate((el) => el.scrollHeight - el.clientHeight);
    expect(body, `step ${step} scrolls`).toBeLessThanOrEqual(1);
    if (step < 4) await page.click('#ob-next');
  }
  await page.click('#ob-next');
  await expect(page.locator('#onboard-scrim')).toBeHidden();
  await expect(page.locator('#panel-wrap')).toBeVisible();
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
