// A Playwright `test` whose `launch` fixture starts the app and always closes
// it, attaching a screenshot of every open window when a test fails.
const base = require('@playwright/test');
const { launchApp } = require('./helpers');

const test = base.test.extend({
  launch: async ({}, use, testInfo) => {
    const running = [];
    await use(async (options) => {
      const started = await launchApp(options);
      running.push(started.app);
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
  }
});

module.exports = { test, expect: base.expect };
