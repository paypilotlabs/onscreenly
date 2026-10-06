const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('./fixtures');
const {
  closeSettings,
  makeFolder,
  openSettingsTab,
  startMockProvider,
  stubDialogs,
  systemPrompt,
  tempDir,
  userPrompt
} = require('./helpers');

const ANALYSIS = [
  '## Summary',
  'Backend engineer with payments depth.',
  '',
  '## Strengths',
  '- Moved the ledger to PostgreSQL with **zero downtime**',
  '',
  '## Keyword match',
  'Missing: Kafka.',
  '',
  '## Likely interview questions',
  '1. How did you migrate the ledger?',
  '2. How would you add Kafka?'
].join('\n');

let provider;
test.beforeEach(async () => {
  provider = await startMockProvider((request) =>
    /résumé reviewer/.test(systemPrompt(request)) ? ANALYSIS : 'You cut p99 checkout latency to 180 ms.'
  );
});
test.afterEach(async () => provider.close());

test('a question is answered by the provider and uses the matching notes from the Obsidian vault', async ({
  launch
}) => {
  const vault = makeFolder('vault', {
    'Projects/Payments rewrite.md': '# Payments rewrite\n## Results\nCut p99 checkout latency from 900 ms to 180 ms.',
    'Daily/2026-10-01.md': 'Groceries and gym.',
    'templates/Weekly.md': 'checkout latency template',
    '.obsidian/workspace.json': '{}'
  });
  const { app, page } = await launch({ settings: provider.settings });
  await stubDialogs(app, { openFolder: vault });

  await openSettingsTab(page, 'knowledge');
  await page.click('#vault-pick');
  await expect(page.locator('#knowledge-status')).toContainText('2 notes');
  await expect(page.locator('#knowledge-enabled')).toBeChecked();
  await page.fill('#knowledge-test', 'checkout latency');
  await expect(page.locator('.k-result-title').first()).toHaveText('Payments rewrite › Results');
  await closeSettings(page);

  await page.evaluate(() => onscreenly.ask({ mode: 'ask', text: 'How did we cut checkout latency?' }));
  await expect(page.locator('.response-group').last().locator('.ai-text')).toContainText('180 ms');
  await expect(page.locator('.response-group').last().locator('.ai-source')).toHaveText(['Payments rewrite']);

  const prompt = systemPrompt(provider.requests.at(-1));
  expect(prompt).toContain("Reference notes from the user's Obsidian vault");
  expect(prompt).toContain('Cut p99 checkout latency from 900 ms to 180 ms.');
  expect(prompt).not.toContain('template');
});

test('résumé analysis reads the imported résumé and shows cards that copy and save as Markdown', async ({ launch }) => {
  const docs = makeFolder('docs', {
    'resume.md': '# Jane Doe\nBackend engineer.\n- Moved the ledger to PostgreSQL on AWS.'
  });
  const savePath = path.join(tempDir('save'), 'analysis.md');
  const { app, page } = await launch({ settings: provider.settings });
  await stubDialogs(app, { openFile: path.join(docs, 'resume.md'), saveFile: savePath });

  await openSettingsTab(page, 'profile');
  await expect(page.locator('#resume-analyse')).toBeDisabled();
  await page.click('#resume-import');
  await expect(page.locator('#resume-text')).toHaveValue(/Jane Doe/);
  await page.fill('#job-description', 'We need PostgreSQL, AWS and Kafka. Kafka is a must.');
  await page.click('#resume-analyse');
  await expect(page.locator('#settings-scrim')).toBeHidden();

  await expect(page.locator('.ai-card h3')).toHaveText([
    'Summary',
    'Strengths',
    'Keyword match',
    'Likely interview questions'
  ]);
  await expect(page.locator('.ai-card ol li')).toHaveCount(2);
  const request = provider.requests.at(-1);
  expect(request.max_tokens).toBe(3000);
  expect(userPrompt(request)).toContain('- Moved the ledger to PostgreSQL on AWS.');
  expect(userPrompt(request)).toMatch(/Keyword match computed by Onscreenly .*: \d+%/);

  await page.click('.ai-action:text-is("Copy")');
  await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toBe(ANALYSIS);
  await page.click('.ai-action:text-is("Save as Markdown…")');
  await expect.poll(() => fs.existsSync(savePath) && fs.readFileSync(savePath, 'utf8')).toBe(ANALYSIS);
});
