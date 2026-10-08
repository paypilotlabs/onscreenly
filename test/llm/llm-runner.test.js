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
stub('src/capture/screen.js', { captureScreenshot: async () => 'data:image/png;base64,AA==' });
stub('src/llm/llm.js', { createLLM: () => llm });
stub('src/integrations/applink.js', { recordEvent: () => {} });
stub('app/main/publik-controller.js', {
  publikNoteHeaders: () => {},
  publikScheduleWalletRefresh: () => {},
  publikHandleErrorAction: () => {}
});
stub('app/main/knowledge.js', { retrieveNotes: async () => ({ block: '', sources: [] }) });

const { session, setSender } = require('../../app/main/session');
const { runFeature } = require('../../app/main/llm-runner');

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
