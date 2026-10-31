// runFeature tells the renderer which mode an answer is for (its thinking label) and gives every
// error the user can fix a `code`, which the renderer turns into one button under the answer. The
// main-process modules it uses that need Electron, the screen or a provider are replaced in
// require's cache before it loads; prompts, publik and the session are the real modules.
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..', '..');

let settings;
let llm;

function stub(rel, exports) {
  const file = require.resolve(path.join(ROOT, rel));
  const mod = new Module(file);
  mod.filename = file;
  mod.exports = exports;
  mod.loaded = true;
  require.cache[file] = mod;
}

stub('src/storage/store.js', { getSettings: () => settings });
let screenshot;
stub('src/capture/screen.js', { captureScreenshot: () => screenshot() });
stub('src/llm/llm.js', { createLLM: () => llm });
stub('src/integrations/applink.js', { recordEvent: () => {} });
stub('app/main/publik-controller.js', {
  publikNoteHeaders: () => {},
  publikScheduleWalletRefresh: () => {},
  publikHandleErrorAction: () => {}
});
stub('app/main/knowledge.js', { retrieveNotes: async () => ({ block: '', sources: [] }) });

const { session, setSender } = require('../../app/main/session');
const { runFeature, cancelCurrent } = require('../../app/main/llm-runner');

function baseSettings(overrides = {}) {
  return {
    provider: 'deepseek',
    apiKeys: { deepseek: 'sk-test' },
    models: {},
    resumeText: '',
    aiRules: '',
    publik: { disclosureAccepted: 1, cardShown: true },
    ...overrides
  };
}

function readyLLM(stream) {
  return { ready: true, model: 'm', configurationError: '', stream };
}

/** Runs one feature and returns what it sent to the renderer, by channel. */
async function run(t, mode, text = '') {
  t.mock.method(console, 'log', () => {});
  const sent = [];
  setSender((channel, data) => sent.push({ channel, data }));
  await runFeature(mode, text);
  const of = (channel) => sent.filter((m) => m.channel === channel).map((m) => m.data);
  return { start: of('llm:start')[0], errors: of('llm:error'), done: of('llm:done'), tokens: of('llm:token') };
}

test.beforeEach(() => {
  screenshot = async () => 'data:image/png;base64,AA==';
  settings = baseSettings();
  llm = readyLLM(async ({ onToken }) => onToken('Use a sliding window.'));
  session.state.capturing = false;
  session.state.busy = false;
  session.transcript.splice(0);
});

test('llm:start names the mode, so the renderer can say what it is doing', async (t) => {
  const { start, errors, done, tokens } = await run(t, 'leetcode');
  assert.equal(start.mode, 'leetcode');
  assert.deepEqual(errors, []);
  assert.equal(done.length, 1);
  assert.deepEqual(tokens, [{ text: 'Use a sliding window.' }]);
});

test('a provider that is not set up is a no-provider error', async (t) => {
  llm = { ready: false, model: '', configurationError: 'Add your DeepSeek API key in Settings › API keys.' };
  const { errors } = await run(t, 'say');
  assert.deepEqual(errors, [{ message: 'Add your DeepSeek API key in Settings › API keys.', code: 'no-provider' }]);
});

test('publik errors carry their action and no code: the banner or the card owns the next step', async (t) => {
  settings = baseSettings({ provider: 'publik', apiKeys: { publik: '' }, publik: { disclosureAccepted: 0 } });
  llm = { ready: false, model: '', configurationError: 'publik API is not set up on this computer yet.' };
  const { errors } = await run(t, 'say');
  assert.equal(errors.length, 1);
  assert.deepEqual(errors[0].action, { kind: 'disclosure' });
  assert.equal(errors[0].code, undefined);

  settings = baseSettings({ provider: 'publik', apiKeys: { publik: 'pk' }, publik: { cardShown: false } });
  llm = readyLLM(async () => {});
  const card = await run(t, 'say');
  assert.deepEqual(card.errors[0].action, { kind: 'card' });
  assert.equal(card.errors[0].code, undefined);
});

test('résumé analysis without a résumé is a needs-resume error', async (t) => {
  const { start, errors } = await run(t, 'resumeAnalysis');
  assert.equal(start.mode, 'resumeAnalysis');
  assert.deepEqual(errors, [
    { message: 'Add your résumé in Settings › Profile first, then try again.', code: 'needs-resume' }
  ]);
});

test('Recap with nothing heard asks for a session, or for speech once one is running', async (t) => {
  const idle = await run(t, 'recap');
  assert.equal(idle.errors.length, 1);
  assert.equal(idle.errors[0].code, 'needs-session');
  assert.match(idle.errors[0].message, /Start a session/);

  session.state.capturing = true;
  const live = await run(t, 'recap');
  assert.equal(live.errors.length, 1);
  assert.equal(live.errors[0].code, 'needs-speech');
  assert.match(live.errors[0].message, /Nothing has been transcribed yet/);
});

test('a stream that fails before any text is provider-failed; after some text, interrupted', async (t) => {
  llm = readyLLM(async () => {
    throw new Error('DeepSeek is overloaded right now. Try again in a moment.');
  });
  const refused = await run(t, 'leetcode');
  assert.deepEqual(refused.errors, [
    { message: 'DeepSeek is overloaded right now. Try again in a moment.', action: null, code: 'provider-failed' }
  ]);

  llm = readyLLM(async ({ onToken }) => {
    onToken('Keep a queue per card');
    throw new Error('socket hang up');
  });
  const cut = await run(t, 'leetcode');
  assert.deepEqual(cut.tokens, [{ text: 'Keep a queue per card' }]);
  assert.deepEqual(cut.errors, [{ message: 'socket hang up', action: null, code: 'interrupted' }]);
});

test('a stream error that carries an action gets no code', async (t) => {
  llm = readyLLM(async () => {
    throw Object.assign(new Error('publik API needs a plan.'), { action: { kind: 'claim', label: 'Pick a plan' } });
  });
  const { errors } = await run(t, 'leetcode');
  assert.equal(errors.length, 1);
  assert.deepEqual(errors[0].action, { kind: 'claim', label: 'Pick a plan' });
  assert.equal(errors[0].code, undefined);
});

// Lets pending promise callbacks run between mocked timer ticks.
const settle = () => new Promise((r) => setImmediate(r));

function runAsync(t, mode, text = '') {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'warn', () => {});
  const sent = [];
  setSender((channel, data) => sent.push({ channel, data }));
  const finished = runFeature(mode, text);
  const of = (channel) => sent.filter((m) => m.channel === channel).map((m) => m.data);
  return { finished, of };
}

test('a screenshot that never returns times out instead of wedging every later question', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  screenshot = () => new Promise(() => {});
  const { finished, of } = runAsync(t, 'ask', 'What is a mutex?');
  await settle();
  t.mock.timers.tick(10000);
  await settle();
  await finished;
  assert.equal(of('llm:done').length, 1, 'the question is still answered, without a screenshot');
  assert.equal(session.state.busy, false);
});

test('Ask without a screenshot tells the model there is none; LeetCode stops with needs-screen', async (t) => {
  screenshot = async () => null;
  let prompt = '';
  llm = readyLLM(async ({ turns, onToken }) => {
    prompt = turns[0].text;
    onToken('ok');
  });
  await run(t, 'ask', 'What is a mutex?');
  assert.match(prompt, /No screenshot is attached/);
  const leet = await run(t, 'leetcode');
  assert.equal(leet.errors.length, 1);
  assert.equal(leet.errors[0].code, 'needs-screen');
});

test('Stop cancels the provider request and ends the answer as stopped, not as an error', async (t) => {
  let signal;
  llm = readyLLM(({ onToken, signal: s }) => {
    signal = s;
    onToken('Partial');
    return new Promise(() => {}); // a provider that would keep going
  });
  const { finished, of } = runAsync(t, 'ask', 'q');
  await settle();
  cancelCurrent();
  await finished;
  assert.equal(signal.aborted, true, 'the request itself is cancelled');
  assert.deepEqual(of('llm:done'), [{ stopped: true }]);
  assert.deepEqual(of('llm:error'), []);
  assert.equal(session.state.busy, false);
});

test('the stall watchdog cancels the request it gives up on', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal;
  llm = readyLLM(({ signal: s }) => {
    signal = s;
    return new Promise(() => {});
  });
  const { finished, of } = runAsync(t, 'say');
  await settle();
  t.mock.timers.tick(25000);
  await finished;
  assert.equal(signal.aborted, true);
  assert.match(of('llm:error')[0].message, /timed out/);
});

test('a reasoning model that is thinking is not mistaken for a stall', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let hooks;
  let finish;
  llm = readyLLM((params) => {
    hooks = params;
    return new Promise((r) => (finish = r));
  });
  const { finished, of } = runAsync(t, 'say');
  await settle();
  for (let i = 0; i < 4; i++) {
    t.mock.timers.tick(20000);
    hooks.onActivity();
  }
  hooks.onToken('Here is the answer.');
  finish('Here is the answer.');
  await finished;
  assert.deepEqual(of('llm:error'), []);
  assert.equal(of('llm:done').length, 1);
});

test('an answer cut off at the length limit is marked truncated; an empty one is an error', async (t) => {
  llm = readyLLM(async ({ onToken, onFinish }) => {
    onToken('Step one, then');
    onFinish({ truncated: true });
  });
  const cut = await run(t, 'say');
  assert.equal(cut.done[0].truncated, true);

  llm = readyLLM(async ({ onFinish }) => onFinish({ truncated: false }));
  const empty = await run(t, 'say');
  assert.equal(empty.done.length, 0);
  assert.equal(empty.errors[0].code, 'provider-failed');
  assert.match(empty.errors[0].message, /empty answer/);
});

test('a provider error with its own code (a rejected key) keeps it', async (t) => {
  llm = readyLLM(async () => {
    throw Object.assign(new Error('OpenAI rejected the API key (401).'), { code: 'no-provider' });
  });
  const { errors } = await run(t, 'say');
  assert.equal(errors[0].code, 'no-provider');
});

test('a question while another is being answered is not silently dropped', async (t) => {
  session.state.busy = true;
  t.mock.method(console, 'log', () => {});
  const sent = [];
  setSender((channel, data) => sent.push({ channel, data }));
  await runFeature('say', '');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].channel, 'status');
  assert.match(sent[0].data.message, /Still answering/);
});

test('Add screen keeps parts of a long problem; the solve sends them all, oldest first, then lets them go', async (t) => {
  const { addProblemScreen } = require('../../app/main/llm-runner');
  session.problemScreens.clear();
  const sent = [];
  setSender((channel, data) => sent.push({ channel, data }));
  screenshot = async () => 'data:image/png;base64,top';
  await addProblemScreen();
  screenshot = async () => 'data:image/png;base64,middle';
  await addProblemScreen();
  assert.deepEqual(
    sent.filter((m) => m.channel === 'problem:screens').map((m) => m.data),
    [
      { count: 1, max: session.problemScreens.max },
      { count: 2, max: session.problemScreens.max }
    ]
  );

  let request;
  llm = readyLLM(async (params) => {
    request = params;
    params.onToken('def solve(): ...');
  });
  screenshot = async () => 'data:image/png;base64,bottom';
  const { start, errors, done } = await run(t, 'leetcode');
  assert.deepEqual(errors, []);
  assert.equal(done.length, 1);
  assert.equal(start.userBubble, "Solve what's on screen (3 screens)");
  assert.deepEqual(request.imageDataUrls, [
    'data:image/png;base64,top',
    'data:image/png;base64,middle',
    'data:image/png;base64,bottom'
  ]);
  assert.match(request.turns[0].text, /across these 3 screenshots/);
  assert.equal(session.problemScreens.count(), 0, 'a solved problem lets its parts go');
});

test('a failed solve keeps the added parts for Try again, and they stand in when the screen cannot be read', async (t) => {
  session.problemScreens.clear();
  session.problemScreens.add('data:image/png;base64,top');
  llm = readyLLM(async () => {
    throw new Error('the provider is down');
  });
  const failed = await run(t, 'leetcode');
  assert.equal(failed.errors.length, 1);
  assert.equal(session.problemScreens.count(), 1, 'kept for Try again');

  let request;
  llm = readyLLM(async (params) => {
    request = params;
    params.onToken('ok');
  });
  screenshot = async () => {
    throw new Error('denied');
  };
  const retried = await run(t, 'leetcode');
  assert.deepEqual(retried.errors, []);
  assert.deepEqual(request.imageDataUrls, ['data:image/png;base64,top']);
  session.problemScreens.clear();
});

test('Add screen says when it already holds the most parts, and other modes never use them', async (t) => {
  const { addProblemScreen } = require('../../app/main/llm-runner');
  session.problemScreens.clear();
  for (let i = 0; i < session.problemScreens.max; i++) session.problemScreens.add(`data:image/png;base64,${i}`);
  const sent = [];
  setSender((channel, data) => sent.push({ channel, data }));
  await addProblemScreen();
  assert.deepEqual(sent.at(-1), {
    channel: 'problem:screens',
    data: { count: session.problemScreens.max, max: session.problemScreens.max, full: true }
  });

  let request;
  llm = readyLLM(async (params) => {
    request = params;
    params.onToken('ok');
  });
  await run(t, 'assist');
  assert.deepEqual(request.imageDataUrls, ['data:image/png;base64,AA==']);
  assert.equal(session.problemScreens.count(), session.problemScreens.max, 'assist leaves them alone');
  session.problemScreens.clear();
});
