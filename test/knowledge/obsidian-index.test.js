const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createVaultIndex, isExcluded, obsidianUrl, readNoteFile } = require('../../src/knowledge/obsidian-index');

function makeVault(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'onscreenly-vault-'));
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  }
  return root;
}

function snapshot(dir) {
  const out = {};
  const walk = (rel) => {
    for (const entry of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const child = path.join(rel, entry.name);
      if (entry.isDirectory()) walk(child);
      else {
        const stat = fs.statSync(path.join(dir, child));
        out[child] = `${stat.size}:${stat.mtimeMs}:${fs.readFileSync(path.join(dir, child), 'utf8')}`;
      }
    }
  };
  walk('');
  return out;
}

const VAULT = {
  'Projects/Payments rewrite.md': [
    '---',
    'tags: [work, payments]',
    'aliases:',
    '  - Ledger migration',
    '---',
    '# Payments rewrite',
    'Moved the card ledger from MySQL to Postgres with zero downtime.',
    '',
    '## Results',
    'Cut p99 checkout latency from 900 ms to 180 ms and saved $40k a year. See [[Kafka notes|our Kafka setup]].',
    '',
    '%% private: ask Sam about the bonus %%'
  ].join('\n'),
  'Learning/Kafka notes.md': '# Kafka\nConsumer groups rebalance when a member leaves. #streaming',
  'Daily/2026-10-01.md': 'Groceries, gym, call mum.',
  'templates/Meeting.md': '# {{title}}\nAttendees: payments ledger postgres',
  '.obsidian/workspace.json': '{"payments": true}',
  'Attachments/diagram.png': 'not markdown payments'
};

test('excluded folders match by name anywhere or by path from the root', () => {
  assert.equal(isExcluded('templates/Meeting.md', ['templates']), true);
  assert.equal(isExcluded('Work/Templates/Meeting.md', ['templates']), true);
  assert.equal(isExcluded('Work/Old/a.md', ['Work/Old']), true);
  assert.equal(isExcluded('Old/a.md', ['Work/Old']), false);
  assert.equal(isExcluded('templates.md', ['templates']), false);
});

test('search ranks the matching section first and never reads hidden, excluded or non-Markdown files', async () => {
  const root = makeVault(VAULT);
  const index = createVaultIndex({ root });
  await index.refresh();
  assert.deepEqual(index.status().notes, 3);
  const results = index.search('How did you cut checkout latency on the payments ledger?');
  assert.ok(results.length >= 1);
  assert.equal(results[0].relPath, 'Projects/Payments rewrite.md');
  assert.equal(results[0].heading, 'Results', 'the H1 that repeats the title is dropped');
  assert.match(results[0].text, /180 ms/);
  for (const r of results) {
    assert.ok(!r.relPath.startsWith('templates/') && !r.relPath.startsWith('.obsidian'), r.relPath);
  }
  assert.deepEqual(index.search('the and of'), [], 'a query of only stop words matches nothing');
  assert.equal(index.search('Ledger migration')[0].title, 'Payments rewrite', 'aliases count as the title');
});

test('search stays within the character budget and takes at most two sections per note', async () => {
  const body = Array.from({ length: 8 }, (_, i) => `## Part ${i}\n${'Kubernetes rollout notes. '.repeat(30)}`).join(
    '\n'
  );
  const root = makeVault({ 'k8s.md': body, 'other.md': '# Other\nKubernetes once.' });
  const index = createVaultIndex({ root });
  await index.refresh();
  const results = index.search('kubernetes rollout', { maxChars: 900, limit: 5 });
  assert.ok(results.reduce((n, r) => n + r.text.length, 0) <= 900);
  assert.ok(results.filter((r) => r.relPath === 'k8s.md').length <= 2);
});

test('refresh picks up added, changed and deleted notes', async () => {
  const root = makeVault({ 'a.md': 'Terraform modules for networking.' });
  const index = createVaultIndex({ root });
  await index.refresh();
  assert.equal(index.search('terraform').length, 1);

  fs.writeFileSync(path.join(root, 'b.md'), 'Terraform state locking with DynamoDB.');
  fs.writeFileSync(path.join(root, 'a.md'), 'Ansible playbooks only.');
  const later = new Date(Date.now() + 5000);
  fs.utimesSync(path.join(root, 'a.md'), later, later);
  await index.refresh();
  assert.deepEqual(
    index.search('terraform').map((r) => r.relPath),
    ['b.md']
  );

  fs.rmSync(path.join(root, 'b.md'));
  await index.refresh();
  assert.deepEqual(index.search('terraform'), []);
  assert.equal(index.hasNote('a.md'), true);
  assert.equal(index.hasNote('b.md'), false);
});

test('symbolic links are not followed out of the vault', async (t) => {
  const outside = makeVault({ 'secret.md': 'Payroll passwords and payments' });
  const root = makeVault({ 'note.md': 'Payments overview' });
  try {
    fs.symlinkSync(outside, path.join(root, 'linked'), 'dir');
    fs.symlinkSync(path.join(outside, 'secret.md'), path.join(root, 'secret-link.md'), 'file');
  } catch (_) {
    t.skip('symbolic links are not available here');
    return;
  }
  const index = createVaultIndex({ root });
  await index.refresh();
  assert.deepEqual(
    index.search('payments payroll').map((r) => r.relPath),
    ['note.md']
  );
});

test('indexing never changes anything inside the vault', async () => {
  const root = makeVault(VAULT);
  const before = snapshot(root);
  const index = createVaultIndex({ root });
  await index.refresh();
  index.search('payments');
  await index.refresh();
  assert.deepEqual(snapshot(root), before);
});

test('a missing vault folder is reported, not thrown later', async () => {
  const index = createVaultIndex({ root: path.join(os.tmpdir(), 'onscreenly-no-such-vault-' + Date.now()) });
  await assert.rejects(index.refresh());
  assert.deepEqual(index.search('anything'), []);
});

test('obsidian links name the vault folder and the note without .md', () => {
  assert.equal(
    obsidianUrl('/Users/leo/leos-brain', 'Projects/Payments rewrite.md'),
    'obsidian://open?vault=leos-brain&file=Projects%2FPayments%20rewrite'
  );
});

test('watching refreshes after a note changes', async (t) => {
  const root = makeVault({ 'a.md': 'Alpha' });
  const index = createVaultIndex({ root });
  await index.refresh();
  const changed = new Promise((resolve) => {
    const stop = index.watch(
      (result) => {
        if (stop) stop();
        resolve(result);
      },
      { delayMs: 50 }
    );
    if (!stop) {
      t.skip('recursive folder watching is not available here');
      resolve(null);
    }
  });
  fs.writeFileSync(path.join(root, 'b.md'), 'Bravo kubernetes');
  const result = await Promise.race([changed, new Promise((r) => setTimeout(() => r('timeout'), 5000))]);
  if (result === null) return;
  assert.notEqual(result, 'timeout');
  assert.equal(index.search('kubernetes')[0].relPath, 'b.md');
});

async function waitFor(check, ms = 5000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
}

for (const platform of ['linux', 'darwin']) {
  test(`watching (${platform === 'linux' ? 'one watch per folder' : 'one recursive watch'}) sees new folders and deletions`, async (t) => {
    const root = makeVault({ 'a.md': 'Alpha', 'Deep/b.md': 'Bravo' });
    const index = createVaultIndex({ root });
    await index.refresh();
    let changes = 0;
    const stop = index.watch(() => changes++, { delayMs: 50, platform });
    if (!stop) {
      t.skip('folder watching is not available here');
      return;
    }
    try {
      fs.mkdirSync(path.join(root, 'New'));
      await waitFor(() => changes > 0);
      fs.writeFileSync(path.join(root, 'New', 'c.md'), 'Charlie kubernetes');
      assert.ok(await waitFor(() => index.search('kubernetes').length === 1), 'a note in a new folder is found');
      fs.rmSync(path.join(root, 'Deep'), { recursive: true });
      assert.ok(await waitFor(() => !index.hasNote('Deep/b.md')), 'a removed folder drops its notes');
    } finally {
      stop();
    }
  });
}

test('on Linux, hidden and excluded folders are not watched, and a huge tree is not watched at all', async () => {
  const root = makeVault({
    'a.md': 'Alpha',
    '.git/objects/x': 'blob',
    'templates/t.md': 'Template',
    'B/C/d.md': 'Delta'
  });
  const index = createVaultIndex({ root, maxWatchedDirs: 3 });
  await index.refresh();
  const watched = [];
  const original = fs.watch;
  fs.watch = (target, options, listener) => {
    watched.push(path.relative(root, String(target)) || '.');
    return original(target, options, listener);
  };
  try {
    const stop = index.watch(() => {}, { platform: 'linux' });
    assert.ok(stop);
    stop();
    assert.deepEqual(watched.sort(), ['.', 'B', path.join('B', 'C')]);
    const small = createVaultIndex({ root, maxWatchedDirs: 2 });
    await small.refresh();
    assert.equal(
      small.watch(() => {}, { platform: 'linux' }),
      null,
      'too many folders: no watching'
    );
  } finally {
    fs.watch = original;
  }
});

test('a note deleted while a refresh is running is gone after it', async () => {
  const files = {};
  for (let i = 0; i < 200; i++) files[`n${i}.md`] = `Note ${i} about payments`;
  const root = makeVault(files);
  const index = createVaultIndex({ root });
  const first = index.refresh();
  fs.rmSync(path.join(root, 'n150.md'));
  const second = index.refresh();
  await Promise.all([first, second]);
  assert.equal(index.hasNote('n150.md'), false);
});

test('a vault that disappears stops feeding answers', async () => {
  const root = makeVault({ 'a.md': 'Payments ledger' });
  const index = createVaultIndex({ root });
  await index.refresh();
  assert.equal(index.search('payments').length, 1);
  fs.rmSync(root, { recursive: true });
  await assert.rejects(index.refresh());
  assert.deepEqual(index.search('payments'), []);
  assert.equal(index.hasNote('a.md'), false);
});

test('notes past the total size cap are left out and the index says it is incomplete', async () => {
  const root = makeVault({
    'a.md': 'alpha '.repeat(200),
    'b.md': 'bravo '.repeat(200),
    'c.md': 'charlie '.repeat(200)
  });
  const index = createVaultIndex({ root, maxTotalBytes: 2500 });
  await index.refresh();
  assert.equal(index.status().truncated, true);
  assert.equal(index.search('alpha').length, 1);
  assert.equal(index.search('charlie').length, 0);
});

test('a note read never follows a symbolic link or leaves the vault', async (t) => {
  const outside = makeVault({ 'secret.md': 'outside' });
  const root = makeVault({ 'note.md': 'inside' });
  const vaultReal = fs.realpathSync(root);
  try {
    fs.symlinkSync(path.join(outside, 'secret.md'), path.join(root, 'swapped.md'));
    fs.symlinkSync(path.join(root, 'note.md'), path.join(root, 'inner-link.md'));
  } catch (_) {
    t.skip('symbolic links are not available here');
    return;
  }
  assert.equal((await readNoteFile(vaultReal, path.join(root, 'note.md'))).text, 'inside');
  assert.equal(await readNoteFile(vaultReal, path.join(root, 'swapped.md')), null, 'resolves outside the vault');
  await assert.rejects(readNoteFile(vaultReal, path.join(root, 'inner-link.md')), 'a link is not opened');
});

test('titles and headings count toward the character budget', async () => {
  const root = makeVault({ 'a.md': `# ${'Payments '.repeat(5000)}\nLedger body text about payments.` });
  const index = createVaultIndex({ root });
  await index.refresh();
  const results = index.search('payments ledger', { maxChars: 3000 });
  const total = results.reduce((n, r) => n + r.title.length + r.heading.length + r.text.length, 0);
  assert.ok(total <= 3000, String(total));
  assert.ok(results.every((r) => r.heading.length <= 200));
});
