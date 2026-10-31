const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { createMeetingStore } = require('../../src/meetings/meetings');

function tmpStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onscreenly-meetings-'));
  return createMeetingStore({ file: path.join(dir, 'meetings.json') });
}

test('add creates a meeting with a unique id', () => {
  const s = tmpStore();
  const a = s.add();
  const b = s.add();
  assert.notStrictEqual(a.id, b.id);
  assert.strictEqual(a.transcript.length, 0);
});

test('addTurn appends and persists to disk', () => {
  const s = tmpStore();
  const m = s.add();
  s.addTurn(m.id, { channel: 'them', text: 'hello', ts: 1 });
  const reloaded = createMeetingStore({ file: s.file });
  const found = reloaded.get(m.id);
  assert.strictEqual(found.transcript.length, 1);
  assert.strictEqual(found.transcript[0].text, 'hello');
});

test('update writes summary/actionItems', () => {
  const s = tmpStore();
  const m = s.add();
  s.update(m.id, { summary: 'Done deal', actionItems: ['Email client'] });
  assert.strictEqual(s.get(m.id).summary, 'Done deal');
  assert.deepStrictEqual(s.get(m.id).actionItems, ['Email client']);
});

test('search matches title/summary/transcript', () => {
  const s = tmpStore();
  const a = s.add();
  s.update(a.id, { title: 'Client kickoff', summary: 'Discuss pricing tiers' });
  s.addTurn(a.id, { channel: 'them', text: 'quarterly review', ts: 1 });
  assert.strictEqual(s.search('pricing').length, 1);
  assert.strictEqual(s.search('review').length, 1);
  assert.strictEqual(s.search('zzz-nothing').length, 0);
});

test('recentSummaries returns only meetings with a summary', () => {
  const s = tmpStore();
  const a = s.add();
  s.add(); // no summary
  s.update(a.id, { summary: 'One' });
  const rs = s.recentSummaries(5);
  assert.strictEqual(rs.length, 1);
  assert.strictEqual(rs[0].summary, 'One');
});

test('remove deletes a meeting', () => {
  const s = tmpStore();
  const m = s.add();
  assert.strictEqual(s.remove(m.id), true);
  assert.strictEqual(s.remove(m.id), false);
  assert.strictEqual(s.list().length, 0);
});

const crypto = require('crypto');
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'onscreenly-meetings-'));
}

test('a write that dies before the rename leaves the previous history readable', () => {
  const dir = tmpDir();
  const file = path.join(dir, 'meetings.json');
  const s = createMeetingStore({ file });
  const m = s.add();
  s.addTurn(m.id, { channel: 'them', text: 'kept', ts: 1 });
  // A crash between writing the temp file and renaming it over the history.
  fs.writeFileSync(file + '.tmp', '[{"id":"half-writ');
  const reloaded = createMeetingStore({ file });
  assert.equal(reloaded.status().state, 'ok');
  assert.equal(reloaded.get(m.id).transcript[0].text, 'kept');
});

test('a damaged history is set aside byte for byte and recovered from the backup', () => {
  const dir = tmpDir();
  const file = path.join(dir, 'meetings.json');
  const s = createMeetingStore({ file });
  s.add();
  s.add(); // the second save leaves the first in meetings.json.bak
  fs.writeFileSync(file, '[{"id":"trunc');
  const before = hash(file);
  const reloaded = createMeetingStore({ file });
  const status = reloaded.status();
  assert.equal(status.state, 'recovered');
  assert.equal(reloaded.all().length, 1, 'the backup holds the history before the last save');
  assert.equal(hash(status.aside), before, 'the damaged file is kept as it was');
  reloaded.add();
  assert.equal(hash(status.aside), before, 'later saves never touch it');
});

test('a damaged history without a backup is reported and kept, not silently emptied', () => {
  const dir = tmpDir();
  const file = path.join(dir, 'meetings.json');
  fs.writeFileSync(file, 'not json');
  const s = createMeetingStore({ file });
  assert.equal(s.status().state, 'corrupt');
  assert.equal(fs.readFileSync(s.status().aside, 'utf8'), 'not json');
  assert.equal(s.all().length, 0);
});

test('records with missing fields load instead of stopping the app; unreadable ones are kept aside', () => {
  const dir = tmpDir();
  const file = path.join(dir, 'meetings.json');
  fs.writeFileSync(
    file,
    JSON.stringify([{ id: 'a', title: 'x', startedAt: 1 }, 'junk', { id: 'b', transcript: [null] }])
  );
  const s = createMeetingStore({ file });
  assert.deepEqual(
    s.all().map((m) => [m.id, m.transcript.length]),
    [
      ['a', 0],
      ['b', 0]
    ]
  );
  assert.doesNotThrow(() => s.search('x'));
  assert.equal(s.status().state, 'recovered');
  assert.match(fs.readFileSync(s.status().aside, 'utf8'), /junk/);
});

test('history saved by an older version loads unchanged', () => {
  const dir = tmpDir();
  const file = path.join(dir, 'meetings.json');
  const legacy = [
    {
      id: 'old1',
      title: 'Sync',
      startedAt: 5,
      endedAt: 9,
      transcript: [{ channel: 'them', text: 'hi', ts: 6 }],
      summary: 'Talked',
      keyPoints: [],
      decisions: [],
      actionItems: ['Email'],
      followUp: 'a string, as older notes stored it',
      context: '',
      extraField: { kept: true }
    }
  ];
  fs.writeFileSync(file, JSON.stringify(legacy, null, 2));
  const s = createMeetingStore({ file });
  assert.deepEqual(s.all(), legacy);
  s.flush();
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), legacy);
});

test('the history file is readable by its owner only', { skip: process.platform === 'win32' }, () => {
  const dir = tmpDir();
  const s = createMeetingStore({ file: path.join(dir, 'meetings.json') });
  s.add();
  assert.equal(fs.statSync(s.file).mode & 0o777, 0o600);
});

test('a failed save is reported once per streak, and flush says so', () => {
  const dir = tmpDir();
  const file = path.join(dir, 'meetings.json');
  const errors = [];
  const s = createMeetingStore({ file, onError: (e) => errors.push(e) });
  fs.mkdirSync(file + '.tmp'); // the temp file cannot be written
  s.add();
  s.add();
  assert.equal(errors.length, 1);
  assert.equal(s.flush().ok, false);
  fs.rmdirSync(file + '.tmp');
  assert.equal(s.flush().ok, true);
  assert.equal(s.lastError(), null);
  assert.equal(createMeetingStore({ file }).all().length, 2);
});

test('a history over the size limit is never parsed or overwritten until archived', () => {
  const dir = tmpDir();
  const file = path.join(dir, 'meetings.json');
  fs.writeFileSync(file, JSON.stringify([{ id: 'big', transcript: [{ text: 'x'.repeat(5000) }] }]));
  const before = hash(file);
  const s = createMeetingStore({ file, maxLoadBytes: 1000 });
  assert.equal(s.status().state, 'too-large');
  s.addTurn(s.add().id, { channel: 'you', text: 'new', ts: 1 });
  s.flush();
  assert.equal(hash(file), before, 'the large history is untouched');
  const archived = s.archiveOversized();
  assert.equal(hash(archived), before, 'archived as it was');
  assert.equal(s.status().state, 'ok');
  assert.equal(createMeetingStore({ file }).all().length, 1, 'recording continues in a fresh file');
});

test('debounced writes are serialized and the last state wins', async () => {
  const dir = tmpDir();
  const file = path.join(dir, 'meetings.json');
  const s = createMeetingStore({ file, debounceMs: 5 });
  const m = s.add();
  for (let i = 0; i < 20; i++) {
    s.addTurn(m.id, { channel: 'you', text: `t${i}`, ts: i });
    await new Promise((r) => setTimeout(r, 2));
  }
  await new Promise((r) => setTimeout(r, 20));
  await s.settle();
  assert.equal(createMeetingStore({ file }).get(m.id).transcript.length, 20);
});

test('after close, nothing reaches the disk, including a write already scheduled', async () => {
  const dir = tmpDir();
  const file = path.join(dir, 'meetings.json');
  const s = createMeetingStore({ file, debounceMs: 20 });
  s.add();
  s.close();
  s.add();
  s.flush();
  await new Promise((r) => setTimeout(r, 40));
  await s.settle();
  assert.equal(fs.existsSync(file), false);
});

test('clearAll removes the history and every copy of it', () => {
  const dir = tmpDir();
  const file = path.join(dir, 'meetings.json');
  const s = createMeetingStore({ file });
  s.add();
  s.add();
  fs.writeFileSync(file + '.corrupt-x', '[');
  fs.writeFileSync(path.join(dir, 'meetings-archive-x.json'), '[]');
  fs.writeFileSync(path.join(dir, 'other.json'), '{}');
  s.clearAll();
  assert.deepEqual(fs.readdirSync(dir), ['other.json']);
  s.add();
  assert.equal(createMeetingStore({ file }).all().length, 1, 'recording continues after clearing');
});
