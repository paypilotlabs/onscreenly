const assert = require('node:assert/strict');
const test = require('node:test');
const { LocalWhisperTranscriber } = require('../../src/whisper/local-whisper-transcriber');

test('serializes both channels through one persistent session', async () => {
  let activeInferences = 0;
  let maximumConcurrency = 0;
  const transcribedChannels = [];
  const transcripts = [];
  const fakeSession = {
    startCalls: 0,
    stopCalls: 0,
    async start() {
      this.startCalls += 1;
    },
    async transcribe(pcm) {
      activeInferences += 1;
      maximumConcurrency = Math.max(maximumConcurrency, activeInferences);
      await new Promise((resolve) => setImmediate(resolve));
      activeInferences -= 1;
      return pcm.toString();
    },
    abortInferences() {},
    async stop() {
      this.stopCalls += 1;
    }
  };

  const transcriber = new LocalWhisperTranscriber({
    sessionOptions: {},
    sessionFactory: () => fakeSession,
    segmenterFactory: (options) => ({
      push(pcm) {
        transcribedChannels.push(options.channel);
        options.onUtterance(options.channel, Buffer.from(pcm));
      },
      stop() {}
    }),
    onTranscript: (channel, text) => transcripts.push({ channel, text })
  });

  await transcriber.start();
  transcriber.push('you', Buffer.from('first'));
  transcriber.push('them', Buffer.from('second'));
  await transcriber.queueTail;
  await transcriber.stop();

  assert.equal(fakeSession.startCalls, 1);
  assert.equal(fakeSession.stopCalls, 1);
  assert.equal(maximumConcurrency, 1);
  assert.deepEqual(transcribedChannels, ['you', 'them']);
  assert.deepEqual(transcripts, [
    { channel: 'you', text: 'first' },
    { channel: 'them', text: 'second' }
  ]);
});

test('bounds shutdown drain time before aborting an in-flight inference', async () => {
  let rejectInference;
  const stopOptions = [];
  const reportedErrors = [];
  let abortCalls = 0;
  let transcribeCalls = 0;
  const fakeSession = {
    async start() {},
    async transcribe() {
      transcribeCalls += 1;
      return new Promise((_resolve, reject) => {
        rejectInference = reject;
      });
    },
    abortInferences() {
      abortCalls += 1;
      rejectInference(new Error('inference aborted'));
    },
    async stop(options) {
      stopOptions.push(options);
    }
  };
  const transcriber = new LocalWhisperTranscriber({
    sessionOptions: {},
    sessionFactory: () => fakeSession,
    segmenterFactory: (options) => ({
      push(pcm) {
        options.onUtterance(options.channel, Buffer.from(pcm));
      },
      stop() {}
    }),
    drainTimeoutMs: 0,
    onError: (error) => reportedErrors.push(error)
  });

  await transcriber.start();
  transcriber.push('you', Buffer.from('pending'));
  transcriber.push('them', Buffer.from('discard me'));
  await transcriber.stop();
  await transcriber.queueTail;

  assert.equal(abortCalls, 1);
  assert.equal(transcribeCalls, 1);
  assert.deepEqual(reportedErrors, []);
  assert.deepEqual(stopOptions, [{ force: true }]);
});

function fakeTranscriber({ transcribe, maxPendingJobs, statuses = [], transcripts = [] }) {
  return new LocalWhisperTranscriber({
    sessionOptions: {},
    maxPendingJobs,
    sessionFactory: () => ({
      async start() {},
      transcribe,
      abortInferences() {},
      async stop() {}
    }),
    segmenterFactory: (options) => ({
      push(pcm) {
        options.onUtterance(options.channel, Buffer.from(pcm));
      },
      stop() {}
    }),
    onStatus: (s) => statuses.push(s),
    onTranscript: (channel, text) => transcripts.push(text)
  });
}

test('Whisper’s made-up lines over silence are filtered like the cloud paths', async () => {
  const transcripts = [];
  const t = fakeTranscriber({ transcribe: async (pcm) => pcm.toString(), transcripts });
  await t.start();
  t.push('them', Buffer.from('Thank you.'));
  t.push('them', Buffer.from('We ship on Tuesday.'));
  await t.queueTail;
  assert.deepEqual(transcripts, ['We ship on Tuesday.']);
  await t.stop();
});

test('a slow computer cannot queue utterances without limit; skipping is said once', async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  const statuses = [];
  const t = fakeTranscriber({
    transcribe: async (pcm) => {
      await gate;
      return pcm.toString();
    },
    maxPendingJobs: 3,
    statuses
  });
  await t.start();
  for (let i = 0; i < 10; i++) t.push('you', Buffer.from(`u${i}`));
  assert.equal(t.pendingJobs, 3);
  assert.equal(statuses.filter((s) => s.status === 'behind').length, 1);
  release();
  await t.queueTail;
  await t.stop();
});
