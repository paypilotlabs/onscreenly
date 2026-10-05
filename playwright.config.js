// App tests: the real Electron app driven by Playwright (`npm run test:e2e`).
// Unit tests stay on node:test (`npm test`).
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'e2e',
  testMatch: '*.spec.js',
  // One app at a time: each test starts its own Electron instance.
  workers: 1,
  timeout: 120000,
  expect: { timeout: 15000 },
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  // A failing test attaches a screenshot of the app (see e2e/fixtures.js).
  outputDir: 'test-results'
});
