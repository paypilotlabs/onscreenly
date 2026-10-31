const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { createMeetingStore } = require('../../src/meetings/meetings');
const { createMeetingMemory } = require('../../src/meetings/meeting-memory');

const NOTES =
  'Meeting Summary:\nAgreed to ship the Terraform pipeline Tuesday. Budget is $40k.\n\nKey Points:\n- Pipeline is green\n\nDecisions:\n- Ship Tuesday\n\nAction Items:\n- You: send the runbook\n\nFollow-Up:\n- Confirm budget with finance\n';

function harness({ llmReady = true, llmText = NOTES, t0 = 1_000_000 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onscreenly-memory-'));
  const store = createMeetingStore({ file: path.join(dir, 'meetings.json') });
  let clock = t0;
  const llmCalls = [];
  const llmFactory = () => ({
    ready: llmReady,
    async stream(params) {
      llmCalls.push(params);
      return llmText;
    }
  });
  const logs = [];
  const memory = createMeetingMemory({
    store,
    llmFactory,
    now: () => clock,
    log: (m) => logs.push(m),
    minTurnsForNotes: 2
  });
  return {
    store,
    memory,
    llmCalls,
    logs,
    tick: (ms) => {
      clock += ms;
    },
    file: store.file
  };
}
const turn = (channel, text, ts) => ({ channel, text, ts });

test('the first turn opens a meeting and every turn is persisted', () => {
  const { store, memory, file } = harness();
  assert.equal(memory.current, null);
  memory.onTurn(turn('them', 'hello', 1_000_001));
  memory.onTurn(turn('you', 'hi', 1_000_002));
  assert.ok(memory.current);
  const onDisk = createMeetingStore({ file }).all();
  assert.equal(onDisk.length, 1);
  assert.deepEqual(
    onDisk[0].transcript.map((t) => t.text),
    ['hello', 'hi']
  );
  assert.equal(onDisk[0].endedAt, null);
  assert.equal(store.all()[0].id, memory.current.id);
});

test('refreshNotes writes LLM notes and a title once, then only again when there are new turns', async () => {
  const { store, memory, llmCalls, tick } = harness();
  memory.onTurn(turn('them', 'We should ship the Terraform pipeline Tuesday.', 1_000_001));
  memory.onTurn(turn('you', 'Budget is forty thousand.', 1_000_002));
  tick(10);
  const notes = await memory.refreshNotes();
  assert.equal(llmCalls.length, 1);
  assert.match(llmCalls[0].turns[0].text, /Them: We should ship the Terraform pipeline Tuesday\./);
  assert.equal(notes.summary, 'Agreed to ship the Terraform pipeline Tuesday. Budget is $40k.');
  const m = store.get(memory.current.id);
  assert.equal(m.title, 'Agreed to ship the Terraform pipeline Tuesday.');
  assert.deepEqual(m.actionItems, ['You: send the runbook']);
  assert.deepEqual(m.decisions, ['Ship Tuesday']);

  assert.equal(await memory.refreshNotes(), null, 'nothing new — no second LLM call');
  assert.equal(llmCalls.length, 1);
  memory.onTurn(turn('them', 'One more thing.', 1_000_003));
  await memory.refreshNotes();
  assert.equal(llmCalls.length, 2);
});

test('a meeting shorter than minTurnsForNotes gets no notes', async () => {
  const { memory, llmCalls } = harness();
  memory.onTurn(turn('them', 'hello', 1_000_001));
  assert.equal(await memory.refreshNotes(), null);
  assert.equal(llmCalls.length, 0);
});

test('no usable LLM: turns are still persisted, notes are skipped without throwing', async () => {
  const { memory, store, llmCalls } = harness({ llmReady: false });
  memory.onTurn(turn('them', 'a', 1_000_001));
  memory.onTurn(turn('you', 'b', 1_000_002));
  assert.equal(await memory.end(), null);
  assert.equal(llmCalls.length, 0);
  assert.equal(store.all()[0].transcript.length, 2);
  assert.ok(store.all()[0].endedAt);
});

test('end() closes the meeting; the next turn starts a new one', async () => {
  const { memory, store } = harness();
  memory.onTurn(turn('them', 'a', 1_000_001));
  memory.onTurn(turn('you', 'b', 1_000_002));
  await memory.end();
  assert.equal(memory.current, null);
  memory.onTurn(turn('them', 'c', 1_000_003));
  assert.equal(store.all().length, 2);
  assert.ok(store.all()[0].endedAt);
  assert.equal(store.all()[1].endedAt, null);
});

test('a long silence between turns ends the meeting implicitly', () => {
  const { memory, store, tick } = harness();
  memory.onTurn(turn('them', 'a', 1_000_001));
  tick(31 * 60 * 1000);
  memory.onTurn(turn('them', 'b', 1_000_001 + 31 * 60 * 1000));
  assert.equal(store.all().length, 2, 'second turn belongs to a new meeting');
});

test('resumeOpen picks up a recent interrupted meeting and restores its turns', () => {
  const { store, file, tick } = harness();
  const m = store.add();
  store.addTurn(m.id, turn('them', 'before the crash', 1_000_050));
  store.addTurn(m.id, turn('you', 'yes', 1_000_060));
  // fresh process, 5 minutes later
  const later = createMeetingMemory({
    store: createMeetingStore({ file }),
    llmFactory: () => null,
    now: () => 1_000_060 + 5 * 60 * 1000
  });
  const restored = later.resumeOpen();
  assert.deepEqual(
    restored.map((t) => t.text),
    ['before the crash', 'yes']
  );
  assert.equal(later.current.id, m.id);
  later.onTurn(turn('them', 'continuing', 1_000_060 + 5 * 60 * 1000 + 1));
  assert.equal(createMeetingStore({ file }).get(m.id).transcript.length, 3);
  void tick;
});

test('resumeOpen closes a stale open meeting instead of resuming it', () => {
  const { store, file } = harness();
  const m = store.add();
  store.addTurn(m.id, turn('them', 'yesterday', 1_000_050));
  const later = createMeetingMemory({
    store: createMeetingStore({ file }),
    llmFactory: () => null,
    now: () => 1_000_050 + 2 * 60 * 60 * 1000
  });
  assert.deepEqual(later.resumeOpen(), []);
  assert.equal(later.current, null);
  assert.equal(createMeetingStore({ file }).get(m.id).endedAt, 1_000_050, 'closed at its last turn');
});

test('catchUp writes notes for ended meetings that have none', async () => {
  const { store, memory, llmCalls } = harness();
  const a = store.add();
  store.addTurn(a.id, turn('them', 'a', 1));
  store.addTurn(a.id, turn('you', 'b', 2));
  store.update(a.id, { endedAt: 3 });
  const b = store.add();
  store.addTurn(b.id, turn('them', 'short', 4));
  store.update(b.id, { endedAt: 5 }); // too short
  const c = store.add();
  store.addTurn(c.id, turn('them', 'x', 6));
  store.addTurn(c.id, turn('you', 'y', 7));
  store.update(c.id, { endedAt: 8, summary: 'already done' });
  assert.equal(await memory.catchUp(), 1);
  assert.equal(llmCalls.length, 1);
  assert.ok(store.get(a.id).summary);
  assert.equal(store.get(b.id).summary, '');
});

test('memoryBlock offers recent summaries but never the live meeting', async () => {
  const { store, memory } = harness();
  for (let i = 0; i < 5; i++) {
    const m = store.add();
    store.update(m.id, { title: `Meeting ${i}`, summary: `Summary ${i}`, endedAt: 10 + i });
  }
  const block = memory.memoryBlock();
  assert.match(block, /^Previous meetings/);
  assert.match(block, /Meeting 2: Summary 2[\s\S]*Meeting 3: Summary 3[\s\S]*Meeting 4: Summary 4/);
  assert.ok(!block.includes('Meeting 1'), 'only the last three');

  memory.onTurn(turn('them', 'live a', 1_000_001));
  memory.onTurn(turn('you', 'live b', 1_000_002));
  await memory.refreshNotes(); // live meeting now has a summary too
  const during = memory.memoryBlock();
  assert.ok(!during.includes(memory.current.title), 'live meeting must not be fed back as memory');
  assert.match(during, /Meeting 4/);

  const empty = createMeetingMemory({ store: createMeetingStore({}), llmFactory: () => null });
  assert.equal(empty.memoryBlock(), null);
});

test('store: prune keeps the newest N and debounced saves coalesce until flush', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onscreenly-memory-'));
  const file = path.join(dir, 'meetings.json');
  const s = createMeetingStore({ file, debounceMs: 50 });
  for (let i = 0; i < 4; i++) s.add();
  assert.equal(s.prune(2), 2);
  assert.equal(s.all().length, 2);
  assert.ok(!fs.existsSync(file), 'nothing on disk yet — writes are coalesced');
  s.flush();
  assert.equal(createMeetingStore({ file }).all().length, 2);
});

test('a very long conversation continues as a new record instead of growing one without bound', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onscreenly-memory-'));
  const store = createMeetingStore({ file: path.join(dir, 'meetings.json') });
  const memory = createMeetingMemory({ store, llmFactory: () => null, now: () => 1, maxTranscriptChars: 100 });
  for (let i = 0; i < 6; i++) memory.onTurn(turn('them', 'x'.repeat(40), 1));
  const all = store.all();
  assert.equal(all.length, 2);
  assert.equal(all[0].transcript.length, 3);
  assert.equal(all[1].transcript.length, 3, 'no turn is lost');
  assert.equal(all[1].continuedFrom, all[0].id);
  assert.ok(all[0].endedAt);
});

test('retention: 0 saves nothing; a lower number keeps only the newest meetings', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onscreenly-memory-'));
  const store = createMeetingStore({ file: path.join(dir, 'meetings.json') });
  let keepCount = 0;
  let clock = 1;
  const memory = createMeetingMemory({ store, llmFactory: () => null, now: () => clock, getKeep: () => keepCount });
  memory.onTurn(turn('them', 'hello', 1));
  assert.equal(store.all().length, 0);
  assert.equal(fs.existsSync(store.file), false);
  assert.equal(memory.memoryBlock(), null);
  keepCount = 2;
  for (let i = 0; i < 4; i++) {
    memory.onTurn(turn('them', `meeting ${i}`, clock));
    memory.end();
    clock += 1;
  }
  assert.deepEqual(
    store.all().map((m) => m.transcript[0].text),
    ['meeting 2', 'meeting 3']
  );
});

test('notes that keep failing are not re-sent at every launch', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onscreenly-memory-'));
  const file = path.join(dir, 'meetings.json');
  const store = createMeetingStore({ file });
  const m = store.add();
  for (let i = 0; i < 4; i++) store.addTurn(m.id, turn('them', `t${i}`, i));
  store.update(m.id, { endedAt: 10 });
  let calls = 0;
  const failing = () => ({
    ready: true,
    stream: async () => {
      calls++;
      throw new Error('provider down');
    }
  });
  for (let launch = 0; launch < 4; launch++) {
    await createMeetingMemory({ store: createMeetingStore({ file }), llmFactory: failing }).catchUp();
  }
  assert.equal(calls, 2);
});

test('deleting while notes are being written does not bring the meeting back', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onscreenly-memory-'));
  const file = path.join(dir, 'meetings.json');
  const store = createMeetingStore({ file, debounceMs: 20 });
  let release;
  const llm = { ready: true, stream: () => new Promise((r) => (release = r)) };
  const memory = createMeetingMemory({ store, llmFactory: () => llm, now: () => 1, minTurnsForNotes: 1 });
  memory.onTurn(turn('them', 'private', 1));
  const notes = memory.end(); // notes on their way, a debounced save pending
  memory.dispose();
  store.clearAll();
  release(NOTES);
  assert.equal(await notes, null);
  await new Promise((r) => setTimeout(r, 40));
  await store.settle();
  assert.equal(fs.existsSync(file), false);

  // The same race with the history cleared but recording kept on.
  const store2 = createMeetingStore({ file, debounceMs: 20 });
  const memory2 = createMeetingMemory({ store: store2, llmFactory: () => llm, now: () => 1, minTurnsForNotes: 1 });
  memory2.onTurn(turn('them', 'private', 1));
  const notes2 = memory2.end();
  memory2.clearHistory();
  release(NOTES);
  assert.equal(await notes2, null);
  await new Promise((r) => setTimeout(r, 40));
  await store2.settle();
  assert.deepEqual(createMeetingStore({ file }).all(), []);
});
