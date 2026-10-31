const assert = require('node:assert/strict');
const test = require('node:test');
const { UtteranceSegmenter } = require('../../src/stt/utterance-segmenter');

const FRAME_SAMPLES = 480;
const FRAME_BYTES = FRAME_SAMPLES * 2;

function frame(amplitude) {
  const buffer = Buffer.alloc(FRAME_BYTES);
  for (let offset = 0; offset < buffer.length; offset += 2) buffer.writeInt16LE(amplitude, offset);
  return buffer;
}

function pushFrames(segmenter, amplitude, count) {
  for (let index = 0; index < count; index += 1) segmenter.push(frame(amplitude));
}

test('includes pre-roll and emits after the configured trailing silence', () => {
  const utterances = [];
  const speechStates = [];
  const segmenter = new UtteranceSegmenter({
    channel: 'you',
    onSpeechState: (_channel, speaking) => speechStates.push(speaking),
    onUtterance: (_channel, pcm) => utterances.push(pcm)
  });

  pushFrames(segmenter, 0, 10);
  pushFrames(segmenter, 1200, 8);
  pushFrames(segmenter, 0, 18);

  assert.equal(utterances.length, 1);
  assert.ok(utterances[0].length >= FRAME_BYTES * 30);
  assert.deepEqual(speechStates, [true, false]);
});

test('flushes a final active utterance when capture stops', () => {
  const utterances = [];
  const segmenter = new UtteranceSegmenter({
    channel: 'them',
    onUtterance: (_channel, pcm) => utterances.push(pcm)
  });
  pushFrames(segmenter, 1000, 8);
  segmenter.stop();
  assert.equal(utterances.length, 1);
  assert.ok(utterances[0].length >= FRAME_BYTES * 8);
});

test('splits long speech into bounded segments with overlap', () => {
  const utterances = [];
  const segmenter = new UtteranceSegmenter({
    channel: 'you',
    preRollMs: 60,
    minUtteranceMs: 30,
    maxUtteranceMs: 300,
    overlapMs: 60,
    onUtterance: (_channel, pcm) => utterances.push(pcm)
  });
  pushFrames(segmenter, 1000, 24);
  segmenter.stop();

  assert.ok(utterances.length >= 3);
  assert.equal(utterances[0].length, FRAME_BYTES * 10);
  assert.equal(utterances[1].length, FRAME_BYTES * 10);
  assert.ok(utterances.every((pcm) => pcm.length <= FRAME_BYTES * 10));
});

test('a short noise blip ends what it started and is not transcribed', () => {
  const { AdaptiveVAD } = require('../../src/stt/vad');
  const events = [];
  const vad = new AdaptiveVAD({
    onSpeechStart: () => events.push('start'),
    onSpeechEnd: (_ms, info) => events.push(info && info.short ? 'end-short' : 'end')
  });
  const tone = (ms, amp) => {
    const n = (16000 * ms) / 1000;
    const b = Buffer.alloc(n * 2);
    for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / 3) * amp), i * 2);
    return b;
  };
  vad.processChunk(tone(60, 3000));
  for (let i = 0; i < 30; i++) vad.processChunk(tone(200, 0));
  assert.deepEqual(events, ['start', 'end-short']);
});

test('the segmenter drops a blip instead of collecting silence after it', () => {
  const utterances = [];
  const states = [];
  const segmenter = new UtteranceSegmenter({
    channel: 'you',
    onUtterance: (_c, pcm) => utterances.push(pcm),
    onSpeechState: (_c, speaking) => states.push(speaking)
  });
  segmenter.push(frame(4000)); // one 30 ms frame: shorter than any word
  for (let i = 0; i < 60; i++) segmenter.push(frame(0));
  assert.deepEqual(states, [true, false]);
  assert.equal(segmenter.collecting, false);
  assert.equal(utterances.length, 0);
});
