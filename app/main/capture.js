// Listening: routes mic/system PCM from the renderer to local Whisper,
// streaming speech-to-text, or the batch transcription loop.
//
// Mic + system audio are both captured in the RENDERER (getUserMedia for the mic,
// getDisplayMedia loopback for system audio) so they run inside Onscreenly's own process
// and use Onscreenly's own Screen-Recording grant — no separate helper binary to authorize.
const { handle, on } = require('./ipc-guard');
const { isValidPcmChunk } = require('./ipc-policy');
const store = require('../../src/storage/store');
const { createSTT } = require('../../src/stt/stt');
const { rms16 } = require('../../src/stt/wav');
const { createStreamingSTT } = require('../../src/stt/stt-streaming');
const { AdaptiveVAD, AudioRingBuffer } = require('../../src/stt/vad');
const { recordEvent } = require('../../src/integrations/applink');
const { session, send, pushTranscript } = require('./session');
const whisper = require('./whisper');
const slides = require('./slides');

const { state } = session;
const buffers = { you: [], them: [] };
const FLUSH_MS = 900;
const MIN_BYTES = Math.floor(16000 * 2 * 0.12); // ~0.12s
const RMS_GATE = 180;
let flushTimer = null;
let desiredCaptureState = false;
let captureTransition = Promise.resolve(false);

// A session with nothing to transcribe it still answers about the screen. The code turns the
// renderer's speech status into "No speech-to-text", with a button to Settings › Audio.
const STT_UNAVAILABLE = {
  message:
    'No speech-to-text is set up. Add a Deepgram, OpenAI, Groq or Gemini key, or download a local model, in Settings › Audio. Screen answers still work.',
  code: 'stt-unavailable'
};

// -------- streaming STT state --------
let streamingSTT = { you: null, them: null }; // streaming STT instances per channel
let streamingMode = false; // true when using WebSocket streaming STT
const vad = {
  you: new AdaptiveVAD({
    onsetThreshold: 220,
    offsetThreshold: 130,
    silenceFrames: 18, // ~540ms silence before end
    onSpeechStart: () => send('vad:state', { channel: 'you', speaking: true }),
    onSpeechEnd: (dur) => send('vad:state', { channel: 'you', speaking: false, durationMs: dur })
  }),
  them: new AdaptiveVAD({
    onsetThreshold: 200,
    offsetThreshold: 120,
    silenceFrames: 20, // ~600ms for remote audio (more forgiving)
    onSpeechStart: () => send('vad:state', { channel: 'them', speaking: true }),
    onSpeechEnd: (dur) => send('vad:state', { channel: 'them', speaking: false, durationMs: dur })
  })
};
// Pre-speech ring buffers (300ms) so we never clip the start of a word
const ringBuffers = {
  you: new AudioRingBuffer(300, 16000),
  them: new AudioRingBuffer(300, 16000)
};

// -------- STT flushing (batch mode fallback) --------
async function flushChannel(channel) {
  if (state.transcribing[channel]) return;
  const chunks = buffers[channel];
  if (!chunks.length) return;
  const pcm = Buffer.concat(chunks);
  buffers[channel] = [];
  if (pcm.length < MIN_BYTES) return;
  if (rms16(pcm) < RMS_GATE) return; // silence gate

  state.transcribing[channel] = true;
  try {
    const settings = store.getSettings();
    const stt = createSTT(settings);
    if (!stt.available) {
      if (!session.sttDisabled) {
        session.sttDisabled = true;
        send('status', STT_UNAVAILABLE);
      }
      return;
    }
    const res = await stt.transcribe(pcm);
    if (res.error) {
      handleSttError(res.error, settings);
      return;
    }
    if (res.text && res.text.trim() && res.text.trim().length > 1 && !/^[?!.,;:\-…]+$/.test(res.text.trim())) {
      const turn = { channel, text: res.text.trim(), ts: Date.now() };
      pushTranscript(turn);
      send('transcript', turn);
    }
  } catch (e) {
    console.log('[stt] error', e && e.message);
    recordEvent({
      level: 'error',
      event: 'stt_failed',
      msg: e && e.message ? e.message : String(e),
      frame: 'flushChannel',
      context: { channel }
    });
  } finally {
    state.transcribing[channel] = false;
  }
}

function handleSttError(err, settings) {
  console.log('[stt] error', err.provider, err.status, err.code, err.message);
  // Recorded before the early return, because the second and hundredth
  // occurrence still tell you the state Onscreenly is stuck in.
  recordEvent({
    level: 'error',
    event: 'stt_rejected',
    code: err.code || (err.status ? 'http_' + err.status : null),
    msg: err.message,
    frame: 'handleSttError',
    context: { provider: err.provider, status: err.status || null, alreadyDisabled: session.sttDisabled }
  });
  if (session.sttDisabled) return;
  const isQuota =
    err.status === 429 || err.code === 'RESOURCE_EXHAUSTED' || (err.message && err.message.includes('Quota exceeded'));
  const noAccess = err.status === 403 || err.status === 401 || err.code === 'model_not_found' || isQuota;
  session.sttDisabled = true; // stop hammering the API every few seconds
  if (noAccess) {
    send('status', {
      message: `Transcription off: your ${err.provider} key was rejected or hit a quota limit. Update your key in Settings to resume.`
    });
  } else {
    send('status', { message: 'Transcription error (' + err.provider + '): ' + err.message });
  }
}

function startFlushLoop() {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    flushChannel('you');
    flushChannel('them');
  }, FLUSH_MS);
}
function stopFlushLoop() {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}

// -------- streaming STT setup --------
function initStreamingSTT() {
  const settings = store.getSettings();
  streamingMode = false;

  ['you', 'them'].forEach((channel) => {
    let instance = null; // set below; lets the callbacks tell a stale instance from the live one
    const sttInstance = createStreamingSTT(settings, channel, {
      onTranscript: (ch, text) => {
        if (instance && streamingSTT[ch] !== instance) return; // stale instance after a stop/start
        const turn = { channel: ch, text, ts: Date.now() };
        pushTranscript(turn);
        send('transcript', turn);
        send('stt:final', { channel: ch, text });
      },
      onInterim: (ch, text) => {
        if (instance && streamingSTT[ch] !== instance) return;
        send('stt:interim', { channel: ch, text });
      },
      onError: (err) => {
        // A socket torn down by a quick stop/start can still report an error a
        // moment later; acting on it would kill the sessions that replaced it
        // and start the batch loop alongside them (double transcription).
        if (instance && streamingSTT[channel] !== instance) return;
        console.log('[streaming-stt] error', err.provider, err.message);
        const batchFallbackAvailable = createSTT(settings).available;
        stopStreamingSTT(); // close WebSockets and clear keep-alive intervals
        if (batchFallbackAvailable) {
          send('status', {
            message: `Streaming transcription (${err.provider}) error: ${err.message}. Falling back to batch mode.`
          });
          startFlushLoop();
        } else if (!session.sttDisabled) {
          session.sttDisabled = true;
          send('status', {
            message: `Transcription stopped (${err.provider}): ${err.message}. The selected provider has no batch fallback.`
          });
        }
        streamingMode = false;
      },
      onStatusChange: (ch, status) => {
        send('stt:status', { channel: ch, status });
        if (status === 'connected') {
          console.log(`[streaming-stt] ${ch} channel connected`);
        }
      }
    });

    if (sttInstance.type === 'streaming' && sttInstance.instance) {
      instance = sttInstance.instance;
      streamingMode = true;
      streamingSTT[channel] = instance;
      instance.connect();
    }
  });

  return streamingMode;
}

function stopStreamingSTT() {
  ['you', 'them'].forEach((channel) => {
    if (streamingSTT[channel]) {
      streamingSTT[channel].disconnect();
      streamingSTT[channel] = null;
    }
  });
  streamingMode = false;
}

// -------- audio routing (streaming or batch) --------
// Per-channel level report every few seconds while capturing, so "Onscreenly never
// hears me" reports can be told apart: no chunks (capture never reached the
// main process), chunks but rms≈0 (a silent/muted device), or healthy audio
// that the transcriber is dropping.
const AUDIO_LEVEL_LOG_MS = 5000;
const audioLevels = { you: { chunks: 0, peakRms: 0 }, them: { chunks: 0, peakRms: 0 }, lastLog: 0 };
function noteAudioLevel(channel, buf) {
  const lv = audioLevels[channel];
  lv.chunks++;
  if (buf.length >= 2) lv.peakRms = Math.max(lv.peakRms, rms16(buf));
  const now = Date.now();
  if (now - audioLevels.lastLog < AUDIO_LEVEL_LOG_MS) return;
  audioLevels.lastLog = now;
  const fmt = (c) => `${c}: chunks=${audioLevels[c].chunks} peakRms=${Math.round(audioLevels[c].peakRms)}`;
  console.log(
    `[audio] ${fmt('you')} | ${fmt('them')} (gate=${RMS_GATE}, mode=${whisper.getTranscriber() ? 'local' : streamingMode ? 'streaming' : 'batch'})`
  );
  audioLevels.you = { chunks: 0, peakRms: 0 };
  audioLevels.them = { chunks: 0, peakRms: 0 };
}

function routeAudio(channel, pcmBuffer) {
  const buf = Buffer.from(pcmBuffer);
  noteAudioLevel(channel, buf);

  const localWhisperTranscriber = whisper.getTranscriber();
  if (localWhisperTranscriber) {
    localWhisperTranscriber.push(channel, buf);
    return;
  }

  // Always run through VAD for speech state detection
  vad[channel].processChunk(buf);

  // Keep pre-speech buffer
  ringBuffers[channel].write(buf);

  if (streamingMode && streamingSTT[channel]) {
    // Streaming mode: send raw PCM directly to the WebSocket
    streamingSTT[channel].sendAudio(pcmBuffer);
  } else {
    // Batch mode: accumulate in buffers for periodic flush
    buffers[channel].push(buf);
  }
}

// -------- capture toggle --------
async function setCapturing(active) {
  if (active === state.capturing) return state.capturing;

  if (active) {
    session.sttDisabled = false; // reset on re-enable
    const settings = store.getSettings();
    if ((settings.sttProvider || 'auto') === 'local') {
      try {
        await whisper.startLocalWhisper(settings);
        state.capturing = true;
        console.log('[onscreenly] capture started, mode: local');
        slides.startSlidesSession();
        send('capture:state', { active: true, streaming: false, mode: 'local' });
        send('slides:update', { count: 0, last: null });
        return true;
      } catch (error) {
        state.capturing = false;
        desiredCaptureState = false;
        if (error.code === 'STARTUP_CANCELLED') {
          send('stt:status', { provider: 'local', status: 'off' });
          send('capture:state', { active: false, streaming: false, mode: 'local' });
          return false;
        }
        send('stt:status', { provider: 'local', status: 'error' });
        send('status', {
          message: `Local transcription could not start: ${error.message} No audio was sent to a cloud provider.`
        });
        send('capture:state', { active: false, streaming: false, mode: 'local' });
        return false;
      }
    }

    state.capturing = true;
    // Try streaming first, fall back to batch
    const streaming = initStreamingSTT();
    if (!streaming) {
      startFlushLoop();
    }
    slides.startSlidesSession();
    console.log('[onscreenly] capture started, mode:', streaming ? 'streaming' : 'batch');
    send('capture:state', { active: true, streaming: streamingMode, mode: streaming ? 'streaming' : 'batch' });
    send('slides:update', { count: 0, last: null });
    // Say so now rather than when the first words go unheard.
    if (!streaming && !createSTT(settings).available) {
      session.sttDisabled = true;
      send('status', STT_UNAVAILABLE);
    }
    return true;
  }

  state.capturing = false;
  stopFlushLoop();
  stopStreamingSTT();
  if (session.meetingMemory) {
    // Write/refresh the notes for this meeting in the background so the
    // summary survives even if Onscreenly is closed before the meeting formally ends.
    session.meetingMemory
      .refreshNotes()
      .then((notes) => {
        if (notes) send('status', { message: `Meeting notes saved (${session.transcript.length} turns).` });
      })
      .catch(() => {});
  }
  slides.stopSlideLoop();
  buffers.you = [];
  buffers.them = [];
  vad.you.reset();
  vad.them.reset();
  ringBuffers.you.clear();
  ringBuffers.them.clear();
  const stoppingLocalTranscriber = whisper.takeTranscriber();
  send('capture:state', { active: false, streaming: false, mode: stoppingLocalTranscriber ? 'local' : 'off' });
  if (stoppingLocalTranscriber) {
    send('stt:status', { provider: 'local', status: 'stopping' });
    try {
      await stoppingLocalTranscriber.stop();
    } catch (error) {
      console.log('[local-whisper] stop error', error && error.message);
    } finally {
      whisper.clearActiveModel();
    }
  }
  return false;
}

function registerCaptureIpc() {
  handle('capture:toggle', () => {
    const targetState = !desiredCaptureState;
    desiredCaptureState = targetState;
    const localWhisperTranscriber = whisper.getTranscriber();
    if (!targetState && !state.capturing && localWhisperTranscriber) {
      localWhisperTranscriber.forceStop().catch(() => {});
    }
    captureTransition = captureTransition.catch(() => state.capturing).then(() => setCapturing(targetState));
    return captureTransition;
  });
  handle('capture:state', () => ({ active: state.capturing }));
  on('mic:pcm', (_e, arrayBuffer) => {
    if (state.capturing && isValidPcmChunk(arrayBuffer)) routeAudio('you', arrayBuffer);
  });
  on('system:pcm', (_e, arrayBuffer) => {
    if (state.capturing && isValidPcmChunk(arrayBuffer)) routeAudio('them', arrayBuffer);
  });
}

module.exports = { setCapturing, registerCaptureIpc };
