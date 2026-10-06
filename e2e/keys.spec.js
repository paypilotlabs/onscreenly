const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('./fixtures');
const { closeSettings, openSettingsTab } = require('./helpers');

const KEY = 'sk-e2e-test-key-ABCD1234';

test('a saved API key is kept out of the settings file, shown masked, and still there after a restart', async ({
  launch
}) => {
  const first = await launch();
  await openSettingsTab(first.page, 'keys');
  await first.page.click('#provider-seg [data-provider="openai"]');
  await first.page.fill('#key-openai', KEY);
  await closeSettings(first.page);

  const storage = await first.page.evaluate(() => onscreenly.keyStorageStatus());
  const settingsFile = fs.readFileSync(path.join(first.profile, 'onscreenly-data.json'), 'utf8');
  if (storage.mode === 'unavailable') {
    // No OS key store on this runner: the key stays in the file, and Settings says so.
    expect(storage.message).toMatch(/plain text/);
  } else {
    expect(settingsFile).not.toContain(KEY);
    expect(fs.readFileSync(path.join(first.profile, 'secrets.bin')).toString('latin1')).not.toContain(KEY);
  }
  await openSettingsTab(first.page, 'keys');
  await expect(first.page.locator('#key-openai')).toHaveValue('••••••••1234');
  await first.app.close();

  const second = await launch({ profile: first.profile });
  const settings = await second.page.evaluate(() => onscreenly.settingsGet());
  expect(settings.provider).toBe('openai');
  expect(settings.apiKeys.openai).toBe('••••••••1234');
});
