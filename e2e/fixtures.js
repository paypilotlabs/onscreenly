// A Playwright `test` whose `launch` fixture starts the app and always closes
// it, attaching a screenshot of every open window when a test fails. A test
// that passed must also leave no console errors or failed loads behind.
const base = require('@playwright/test');
const { consoleErrors, launchApp } = require('./helpers');

const test = base.test.extend({
  launch: async ({}, use, testInfo) => {
    const running = [];
    const profiles = new Set();
    await use(async (options) => {
      const started = await launchApp(options);
      running.push(started.app);
      profiles.add(started.profile);
      return started;
    });
    for (const app of running) {
      if (testInfo.status !== testInfo.expectedStatus) {
        for (const [i, win] of app.windows().entries()) {
          const shot = await win.screenshot().catch(() => null);
          if (shot) await testInfo.attach(`window-${i}`, { body: shot, contentType: 'image/png' });
        }
      }
      await app.close().catch(() => {});
    }
    if (testInfo.status === testInfo.expectedStatus) {
      for (const profile of profiles)
        base.expect(consoleErrors(profile), 'console errors and failed loads').toEqual([]);
    }
  }
});

module.exports = { test, expect: base.expect };
