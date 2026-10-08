// First run: onboarding hands over to Settings for the provider and comes back
// at its last step once Settings closes.
const { test, expect } = require('./fixtures');

test('onboarding opens Settings for the provider and finishes at You’re all set', async ({ launch }) => {
  const { page } = await launch({ settings: { onboarded: false } });
  await expect(page.locator('#onboard')).toBeVisible();
  await page.click('#ob-next');
  await page.click('#ob-next');
  await page.locator('#ob-buttons button', { hasText: 'Open Settings' }).click();
  await expect(page.locator('#settings')).toBeVisible();
  await page.click('#s-close');
  await expect(page.locator('#settings-scrim')).toBeHidden();
  await expect(page.locator('#ob-title')).toHaveText('You’re all set');
  await expect(page.locator('#ob-title')).toBeVisible();
});
