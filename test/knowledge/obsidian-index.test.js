const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  createVaultIndex,
  isExcluded,
  obsidianUrl,
  parseNote,
  sectionsOf,
  tokenize
} = require('../../src/knowledge/obsidian-index');

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

test('tokenize drops stop words, folds plurals and keeps c++ and c#', () => {
  assert.deepEqual(tokenize('How did the services handle C++ and C# libraries?'), [
    'service',
    'handle',
    'c++',
    'c#',
    'library'
  ]);
});

test('parseNote reads front matter tags and aliases, inline tags and wikilink labels', () => {
  const note = parseNote(VAULT['Projects/Payments rewrite.md'], 'Projects/Payments rewrite.md');
  assert.equal(note.title, 'Payments rewrite');
  assert.deepEqual(note.tags.sort(), ['payments', 'work']);
  assert.deepEqual(note.aliases, ['Ledger migration']);
  assert.match(note.body, /See our Kafka setup\./);
  assert.doesNotMatch(note.body, /bonus/, 'Obsidian %% comments %% are private and dropped');
  assert.deepEqual(parseNote('Notes on #streaming and #2026', 'a.md').tags, ['streaming']);
});

test('sections keep their heading trail and long sections are split', () => {
  const long = Array.from({ length: 30 }, (_, i) => `Paragraph ${i} about payments and ledgers.`).join('\n\n');
  const sections = sectionsOf(`# Work\n## Payments\n${long}\n\`\`\`\n# not a heading\n\`\`\``);
  assert.ok(sections.length > 1);
  assert.ok(sections.every((s) => s.heading === 'Work › Payments'));
  assert.ok(sections.every((s) => s.text.length <= 1600));
  assert.match(sections.at(-1).text, /# not a heading/);
});

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
    const stop = index.watch((result) => {
      if (stop) stop();
      resolve(result);
    }, 50);
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
