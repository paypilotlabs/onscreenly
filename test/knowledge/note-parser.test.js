const test = require('node:test');
const assert = require('node:assert/strict');
const { parseHeading, parseNote, sectionsOf, tokenize } = require('../../src/knowledge/note-parser');

const NOTE = [
  '---',
  'tags: [work, payments]',
  'aliases:',
  '  - Ledger migration',
  '---',
  '# Payments rewrite',
  'Moved the card ledger from MySQL to Postgres with zero downtime.',
  '',
  '## Results',
  'Cut p99 checkout latency from 900 ms to 180 ms. See [[Kafka notes|our Kafka setup]] and [[Runbook#Deploy]].',
  '',
  '%% private: ask Sam about the bonus %%',
  '<!-- hidden -->',
  '![[diagram.png]] Read [the RFC](https://example.com/rfc).'
].join('\n');

test('tokenize drops stop words, folds plurals and keeps c++ and c#', () => {
  assert.deepEqual(tokenize('How did the services handle C++ and C# libraries?'), [
    'service',
    'handle',
    'c++',
    'c#',
    'library'
  ]);
});

test('parseNote reads front matter, inline tags, wikilinks and links, and drops comments and embeds', () => {
  const note = parseNote(NOTE, 'Projects/Payments rewrite.md');
  assert.equal(note.title, 'Payments rewrite');
  assert.deepEqual(note.tags.sort(), ['payments', 'work']);
  assert.deepEqual(note.aliases, ['Ledger migration']);
  assert.match(note.body, /See our Kafka setup and Runbook\./);
  assert.match(note.body, /Read the RFC\./);
  assert.doesNotMatch(note.body, /bonus|hidden|diagram/);
  assert.deepEqual(parseNote('Notes on #streaming and #2026', 'a.md').tags, ['streaming']);
});

test('front matter is read even after a byte-order mark', () => {
  const note = parseNote('﻿---\ntitle: Ledger\ntags: [a]\n---\nBody', 'x.md');
  assert.equal(note.title, 'Ledger');
  assert.deepEqual(note.tags, ['a']);
  assert.equal(note.body, 'Body');
});

test('headings keep a trailing # that belongs to the text', () => {
  assert.deepEqual(parseHeading('## C#'), { level: 2, text: 'C#' });
  assert.deepEqual(parseHeading('### Results ###'), { level: 3, text: 'Results' });
  assert.equal(parseHeading('#tag'), null);
  assert.equal(parseHeading('####### seven'), null);
});

test('sections keep their heading trail and long sections are split', () => {
  const long = Array.from({ length: 30 }, (_, i) => `Paragraph ${i} about payments and ledgers.`).join('\n\n');
  const sections = sectionsOf(`# Work\n## Payments\n${long}\n\`\`\`\n# not a heading\n\`\`\``);
  assert.ok(sections.length > 1);
  assert.ok(sections.every((s) => s.heading === 'Work › Payments'));
  assert.ok(sections.every((s) => s.text.length <= 1600));
  assert.match(sections.at(-1).text, /# not a heading/);
});

test('hostile notes parse in linear time', () => {
  const cases = [
    '# a' + ' '.repeat(100000) + 'x',
    '[['.repeat(100000),
    '![['.repeat(50000),
    '['.repeat(100000),
    '[a]('.repeat(50000),
    '!['.repeat(100000),
    '%%'.repeat(50000),
    '<!--'.repeat(30000),
    '#' + '1'.repeat(100000),
    ' #' + 'a1'.repeat(50000)
  ];
  for (const body of cases) {
    const started = Date.now();
    sectionsOf(parseNote(body, 'x.md').body);
    assert.ok(Date.now() - started < 1000, `${JSON.stringify(body.slice(0, 12))}… took ${Date.now() - started} ms`);
  }
});
