// Exercises the atomic-write/backup-recovery file mechanics in isolation,
// independent of src/store.js's settings schema.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createFileStore } = require('../../src/storage/settings-store-core');

function tempDir(context) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onscreenly-settings-core-'));
  context.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('load() returns null on a fresh install — no file, no backup', (t) => {
  const dir = tempDir(t);
  const fileStore = createFileStore(() => dir, 'onscreenly-data.json');
  assert.equal(fileStore.load(), null);
  assert.equal(fs.readdirSync(dir).length, 0, 'load never creates a file');
});

test('persist() writes atomically: no stray .tmp left behind, and the .bak only appears once a live file exists to snapshot', (t) => {
  const dir = tempDir(t);
  const fileStore = createFileStore(() => dir, 'onscreenly-data.json');

  fileStore.persist({ apiKeys: { openai: 'sk-first' } });
  assert.deepEqual(fs.readdirSync(dir), ['onscreenly-data.json']);

  fileStore.persist({ apiKeys: { openai: 'sk-second' } });
  assert.deepEqual(fs.readdirSync(dir).sort(), ['onscreenly-data.json', 'onscreenly-data.json.bak']);

  const live = JSON.parse(fs.readFileSync(path.join(dir, 'onscreenly-data.json'), 'utf8'));
  const backup = JSON.parse(fs.readFileSync(path.join(dir, 'onscreenly-data.json.bak'), 'utf8'));
  assert.equal(live.apiKeys.openai, 'sk-second');
  assert.equal(backup.apiKeys.openai, 'sk-first', 'the backup holds the PREVIOUS generation');
});

if (process.platform !== 'win32') {
  test('every file persist() writes is 0600 — this file holds every BYO key plus the publik key', (t) => {
    const dir = tempDir(t);
    const fileStore = createFileStore(() => dir, 'onscreenly-data.json');
    fileStore.persist({ a: 1 });
    fileStore.persist({ a: 2 }); // second write exercises the .bak path too
    for (const name of ['onscreenly-data.json', 'onscreenly-data.json.bak']) {
      assert.equal(fs.statSync(path.join(dir, name)).mode & 0o777, 0o600, name);
    }
  });

  test('the in-place EPERM fallback still ends up 0600, not whatever the pre-existing file had', (t) => {
    const dir = tempDir(t);
    const file = path.join(dir, 'onscreenly-data.json');
    // A loosely-permissioned file already exists, simulating one written
    // before this fix, or restored from an external backup.
    fs.writeFileSync(file, '{}', { mode: 0o644 });
    const fileStore = createFileStore(() => dir, 'onscreenly-data.json');
    const originalRename = fs.renameSync;
    fs.renameSync = (from, to) => {
      if (to === file) throw Object.assign(new Error('EPERM'), { code: 'EPERM' });
      return originalRename(from, to);
    };
    try {
      fileStore.persist({ apiKeys: { openai: 'sk-x' } });
    } finally {
      fs.renameSync = originalRename;
    }
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).apiKeys.openai, 'sk-x');
    assert.ok(!fs.existsSync(file + '.tmp'), 'the leftover tmp file is cleaned up');
  });
}

// The backup holds the PREVIOUS generation: persist A then B leaves A in
// .bak and B live. Recovery therefore restores A — strictly better than the
// old behavior of losing every field on a corrupt write.
test('a corrupt live file is recovered from the backup generation', (t) => {
  const dir = tempDir(t);
  const file = path.join(dir, 'onscreenly-data.json');
  const fileStore = createFileStore(() => dir, 'onscreenly-data.json');
  fileStore.persist({ apiKeys: { openai: 'sk-previous' } });
  fileStore.persist({ apiKeys: { openai: 'sk-previous', anthropic: 'sk-latest' } });

  // Simulate the crash mid-write that used to mean permanent data loss.
  fs.writeFileSync(file, '{"apiKeys":{"ope');

  const result = createFileStore(() => dir, 'onscreenly-data.json').load();
  assert.ok(result);
  assert.equal(result.recoveredFromBackup, true);
  assert.equal(result.data.apiKeys.openai, 'sk-previous');
  assert.equal(result.data.apiKeys.anthropic, undefined, 'recovers the PREVIOUS generation, not the latest');
});

test('a corrupt file with no usable backup is reported, not thrown, and left in place', (t) => {
  const dir = tempDir(t);
  fs.writeFileSync(path.join(dir, 'onscreenly-data.json'), 'not json at all');
  const fileStore = createFileStore(() => dir, 'onscreenly-data.json');
  assert.deepEqual(fileStore.load(), { data: null, recoveredFromBackup: false, mainCorrupt: true });
  assert.equal(fs.readFileSync(path.join(dir, 'onscreenly-data.json'), 'utf8'), 'not json at all');
});

test('quarantineMain sets the damaged file aside byte for byte, so a save cannot overwrite it', (t) => {
  const dir = tempDir(t);
  fs.writeFileSync(path.join(dir, 'm.json'), '[{"id":"a"');
  fs.writeFileSync(path.join(dir, 'm.json.bak'), '[{"id":"b"}]');
  const fileStore = createFileStore(() => dir, 'm.json', { validate: Array.isArray });
  const loaded = fileStore.load();
  assert.deepEqual(loaded, { data: [{ id: 'b' }], recoveredFromBackup: true, mainCorrupt: true });
  const aside = fileStore.quarantineMain();
  assert.equal(fs.readFileSync(aside, 'utf8'), '[{"id":"a"');
  fileStore.persist(loaded.data);
  assert.equal(fs.readFileSync(aside, 'utf8'), '[{"id":"a"', 'the set-aside copy is untouched');
  assert.equal(fs.readFileSync(path.join(dir, 'm.json.bak'), 'utf8'), '[{"id":"b"}]', 'the good backup survives');
});

test('validate treats parseable but wrong-shaped JSON as corrupt', (t) => {
  const dir = tempDir(t);
  fs.writeFileSync(path.join(dir, 'm.json'), '{"not":"a list"}');
  const fileStore = createFileStore(() => dir, 'm.json', { validate: Array.isArray });
  assert.equal(fileStore.load().mainCorrupt, true);
});

test('a file over maxBytes is reported without being read', (t) => {
  const dir = tempDir(t);
  fs.writeFileSync(path.join(dir, 'm.json'), '[' + '1,'.repeat(600) + '1]');
  const fileStore = createFileStore(() => dir, 'm.json', { maxBytes: 1000 });
  const loaded = fileStore.load();
  assert.equal(loaded.tooLarge, true);
  assert.ok(loaded.size > 1000);
});

test('persistAsync writes atomically with a backup and owner-only permissions', async (t) => {
  const dir = tempDir(t);
  const fileStore = createFileStore(() => dir, 'm.json', { compact: true });
  await fileStore.persistAsync([1]);
  await fileStore.persistAsync([1, 2]);
  assert.equal(fs.readFileSync(path.join(dir, 'm.json'), 'utf8'), '[1,2]');
  assert.equal(fs.readFileSync(path.join(dir, 'm.json.bak'), 'utf8'), '[1]');
  assert.equal(fs.existsSync(path.join(dir, 'm.json.tmp')), false);
  if (process.platform !== 'win32') assert.equal(fs.statSync(path.join(dir, 'm.json')).mode & 0o777, 0o600);
});

test('persist() throws rather than swallowing a failure, so a caller can surface it', (t) => {
  const missingDir = path.join(os.tmpdir(), 'onscreenly-settings-core-missing-' + process.pid + '-' + Date.now());
  const fileStore = createFileStore(() => missingDir, 'onscreenly-data.json');
  assert.throws(() => fileStore.persist({ smart: true }), /ENOENT/);
});
