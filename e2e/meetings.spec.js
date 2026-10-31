// Meeting history in Settings › API keys › Your data: the count, retention, deleting it, and a
// damaged history file reported and kept rather than silently emptied.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('./fixtures');
const { openSettingsTab } = require('./helpers');

function profileWithMeetings(meetings, raw) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onscreenly-e2e-meetings-'));
  fs.writeFileSync(path.join(dir, 'onscreenly-data.json'), JSON.stringify({ onboarded: true }));
  fs.writeFileSync(path.join(dir, 'meetings.json'), raw !== undefined ? raw : JSON.stringify(meetings));
  return dir;
}
const synthetic = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: `m${i}`,
    title: `Synthetic meeting ${i}`,
    startedAt: 1000 + i,
    endedAt: 2000 + i,
    transcript: [{ channel: 'them', text: `turn ${i}`, ts: 1500 + i }],
    summary: `Summary ${i}`,
    keyPoints: [],
    decisions: [],
    actionItems: []
  }));
const onDisk = (profile) => JSON.parse(fs.readFileSync(path.join(profile, 'meetings.json'), 'utf8'));

// Answers the next confirmation dialog with its destructive button.
function confirmDialogs(app) {
  return app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 1 });
  });
}

test('Your data shows the meeting history, and deleting it removes every meeting', async ({ launch }) => {
  const profile = profileWithMeetings(synthetic(3));
  const { app, page } = await launch({ profile });
  await openSettingsTab(page, 'keys');
  await expect(page.locator('#meeting-history-note')).toContainText('3 meetings');
  await expect(page.locator('#meeting-keep')).toHaveValue('50');
  await confirmDialogs(app);
  await page.click('#meeting-delete');
  await expect(page.locator('#meeting-history-note')).toContainText('No meetings saved yet');
  await expect(page.locator('#meeting-delete')).toBeDisabled();
  expect(fs.existsSync(path.join(profile, 'meetings.json'))).toBe(false);
});

test('keeping fewer meetings deletes only the oldest, after confirming', async ({ launch }) => {
  const profile = profileWithMeetings(synthetic(12));
  const { app, page } = await launch({ profile });
  await openSettingsTab(page, 'keys');
  await expect(page.locator('#meeting-history-note')).toContainText('12 meetings');
  await confirmDialogs(app);
  await page.selectOption('#meeting-keep', '10');
  await expect(page.locator('#meeting-history-note')).toContainText('10 meetings');
  await expect
    .poll(() => onDisk(profile).map((m) => m.id))
    .toEqual(
      synthetic(12)
        .slice(2)
        .map((m) => m.id)
    );
});

test('a damaged history file is reported and kept, not silently emptied', async ({ launch }) => {
  const profile = profileWithMeetings(null, '[{"id":"m0","transcript":[{"text":"cut off');
  const { page } = await launch({ profile });
  await expect(page.locator('#onscreenly-status')).toContainText('could not be read');
  const kept = fs.readdirSync(profile).filter((f) => f.startsWith('meetings.json.corrupt-'));
  expect(kept).toHaveLength(1);
  expect(fs.readFileSync(path.join(profile, kept[0]), 'utf8')).toContain('cut off');
});

test('“Delete all my data” removes the history and every copy of it', async ({ launch }) => {
  const profile = profileWithMeetings(synthetic(2));
  fs.writeFileSync(path.join(profile, 'meetings.json.corrupt-old'), '[');
  fs.writeFileSync(path.join(profile, 'meetings-archive-old.json'), '[]');
  const { app, page } = await launch({ profile });
  await app.evaluate(({ app: electronApp, dialog }) => {
    dialog.showMessageBox = async () => ({ response: 1 });
    electronApp.relaunch = () => {}; // the test checks the files instead of a restart
  });
  const exited = new Promise((resolve) => app.process().once('exit', () => resolve(true)));
  await openSettingsTab(page, 'keys');
  await page.click('#delete-all-data');
  await exited;
  const left = fs.readdirSync(profile).filter((f) => f.startsWith('meetings'));
  expect(left).toEqual([]);
});
