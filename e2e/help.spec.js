// Help: Report a problem opens a pre-filled GitHub issue, and a newer release is announced once,
// unless Settings turns the check off. The release check talks to a local server here.
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('./fixtures');
const { version } = require('../package.json');

async function releaseServer(tag, { delayMs = 0 } = {}) {
  let hits = 0;
  const server = http.createServer(async (req, res) => {
    hits++;
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ tag_name: tag, draft: false, prerelease: false }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}/releases/latest`,
    hits: () => hits,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

const recordOpened = (app) =>
  app.evaluate(({ shell }) => {
    globalThis.__opened = [];
    shell.openExternal = async (url) => {
      globalThis.__opened.push(url);
    };
  });

test('Help offers Report a problem, which opens a new GitHub issue with the version filled in', async ({ launch }) => {
  const { app, page } = await launch();
  await recordOpened(app);
  await page.click('#logo-btn');
  await page.locator('#ob-buttons button', { hasText: 'Report a problem' }).click();
  await expect.poll(() => app.evaluate(() => globalThis.__opened.length)).toBe(1);
  const url = new URL(await app.evaluate(() => globalThis.__opened[0]));
  expect(url.origin + url.pathname).toBe('https://github.com/paypilotlabs/onscreenly/issues/new');
  expect(url.searchParams.get('body')).toContain(`Onscreenly ${version} · `);
});

test('the first run’s guide has no Report a problem button', async ({ launch }) => {
  const { page } = await launch({ settings: { onboarded: false } });
  await expect(page.locator('#onboard')).toBeVisible();
  await expect(page.locator('#ob-buttons button', { hasText: 'Report a problem' })).toHaveCount(0);
});

test('a newer release is announced with Download, which opens the releases page', async ({ launch }) => {
  const server = await releaseServer('v99.0.0');
  try {
    const { app, page } = await launch({ env: { ONSCREENLY_UPDATE_URL: server.url } });
    await recordOpened(app);
    const banner = page.locator('#onscreenly-status');
    await expect(banner).toContainText('Onscreenly 99.0.0 is available.');
    await banner.locator('.banner-action', { hasText: 'Download' }).click();
    await expect
      .poll(() => app.evaluate(() => globalThis.__opened))
      .toEqual(['https://github.com/paypilotlabs/onscreenly/releases/latest']);
    await expect(banner).toBeHidden();
    expect(server.hits()).toBe(1);
  } finally {
    await server.close();
  }
});

test('no notice for the version already installed, and no request at all when the check is off', async ({ launch }) => {
  const same = await releaseServer(`v${version}`);
  const off = await releaseServer('v99.0.0');
  try {
    const first = await launch({ env: { ONSCREENLY_UPDATE_URL: same.url } });
    await expect.poll(() => same.hits()).toBe(1);
    await expect(first.page.locator('#onscreenly-status')).toHaveCount(0);

    const second = await launch({ settings: { checkForUpdates: false }, env: { ONSCREENLY_UPDATE_URL: off.url } });
    await second.page.waitForTimeout(1500);
    expect(off.hits()).toBe(0);
    await expect(second.page.locator('#onscreenly-status')).toHaveCount(0);
  } finally {
    await same.close();
    await off.close();
  }
});

test('Settings › Your data turns the version check off and on', async ({ launch }) => {
  const { page } = await launch();
  await page.click('#tb-settings-btn');
  await page.click('.s-tab[data-tab="keys"]');
  const box = page.locator('#check-updates');
  await expect(box).toBeChecked();
  await box.uncheck();
  await page.click('#s-close');
  await expect(page.locator('#settings-scrim')).toBeHidden();
  expect(await page.evaluate(() => onscreenly.settingsGet().then((s) => s.checkForUpdates))).toBe(false);
});

test('the notice waits for a launch warning to be read, and never replaces it', async ({ launch }) => {
  // A damaged history is reported at launch with Open Your data; the release answer comes after it.
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'onscreenly-e2e-help-'));
  fs.writeFileSync(path.join(profile, 'onscreenly-data.json'), JSON.stringify({ onboarded: true }));
  fs.writeFileSync(path.join(profile, 'meetings.json'), '[{"id":"m0","transcript":[{"text":"cut off');
  const server = await releaseServer('v99.0.0', { delayMs: 300 });
  try {
    const { page } = await launch({ profile, env: { ONSCREENLY_UPDATE_URL: server.url } });
    const banner = page.locator('#onscreenly-status');
    await expect(banner).toContainText('could not be read');
    await expect.poll(() => server.hits()).toBe(1);
    await page.waitForTimeout(800);
    await expect(banner).toContainText('could not be read');
    await expect(banner.locator('.banner-action')).toHaveText('Open Your data');
    await banner.locator('.banner-close').click();
    await expect(banner).toContainText('Onscreenly 99.0.0 is available.');
    await expect(banner.locator('.banner-action')).toHaveText('Download');
  } finally {
    await server.close();
  }
});
