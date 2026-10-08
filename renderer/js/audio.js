// Audio capture in the renderer: microphone via AudioWorklet and meeting audio via getDisplayMedia loopback.
import { state } from './state.js';
import { isMac, isWindows, onscreenly } from './core.js';
import { showAudioStatus, showStatus } from './events.js';

// ---- capture: mic (renderer side) — uses AudioWorklet (modern, off-main-thread) ----
let audioCtx = null,
  micStream = null,
  micWorklet = null;
// Generation counter: startMic() awaits getUserMedia, so a second call (or a
// stopMic()) can land mid-flight. Each start bumps the generation and bails
// if it is no longer current, otherwise two capture pipelines end up feeding
// the "you" channel at once — every slice of speech arrives twice, which the
// transcriber can't make sense of — and the orphaned one keeps the mic hot.
let micGen = 0;
async function startMic() {
  if (micStream) return;
  const gen = ++micGen;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
        sampleRate: 16000
      }
    });
    if (gen !== micGen || micStream) {
      // Superseded while we were waiting: another start won, or a stop came in.
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    micStream = stream;
    // getUserMedia can resolve with a stream that has no usable audio track
    // (e.g. a virtual/placeholder device, or a device that was unplugged
    // between permission grant and capture start). Fail loudly here instead
    // of silently wiring up an AudioWorklet to nothing — that produces the
    // "Onscreenly never hears me, no error shown" symptom with no diagnostic at all.
    const [track] = micStream.getAudioTracks();
    if (!track) {
      micStream.getTracks().forEach((t) => t.stop());
      micStream = null;
      showStatus(
        'No microphone audio track was available. Check Windows Sound settings for a working default input device, then try again.'
      );
      return;
    }
    onscreenly.log(
      'mic stream started: track=' + (track.label || '(no label — permission may be stale)') + ' muted=' + track.muted
    );
    audioCtx = new AudioContext({ sampleRate: 16000 });

    // Use AudioWorklet for low-latency, off-main-thread processing
    try {
      await audioCtx.audioWorklet.addModule('audio-worklet-processor.js');
      const source = audioCtx.createMediaStreamSource(micStream);
      micWorklet = new AudioWorkletNode(audioCtx, 'onscreenly-audio-processor');
      micWorklet.port.onmessage = (e) => {
        onscreenly.micPcm(e.data);
      };
      source.connect(micWorklet);
      // Don't connect to destination — we just capture, don't play
      onscreenly.log('mic AudioWorklet processor attached');
    } catch (workletErr) {
      // Fallback to ScriptProcessor if AudioWorklet fails (shouldn't happen in Electron 33+)
      onscreenly.log('AudioWorklet failed, falling back to ScriptProcessor: ' + workletErr.message);
      const micNode = audioCtx.createMediaStreamSource(micStream);
      const micProc = audioCtx.createScriptProcessor(4096, 1, 1);
      const sink = audioCtx.createGain();
      sink.gain.value = 0;
      micNode.connect(micProc);
      micProc.connect(sink);
      sink.connect(audioCtx.destination);
      micProc.onaudioprocess = (e) => {
        const f = e.inputBuffer.getChannelData(0);
        const out = new Int16Array(f.length);
        for (let i = 0; i < f.length; i++) {
          const s = Math.max(-1, Math.min(1, f[i]));
          out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        onscreenly.micPcm(out.buffer);
      };
      micWorklet = { _legacy: true, proc: micProc, node: micNode, sink };
    }
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    const name = err && err.name;
    onscreenly.log('mic error: ' + name + ' — ' + message);
    // getUserMedia's DOMException.name is the reliable signal here — the
    // .message text varies by Chromium version and isn't meant for users.
    // Distinguishing "no device" from "denied" from "in use elsewhere"
    // turns one generic dead end into three different next actions.
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      showStatus(
        'No microphone was found. Plug one in, or pick a default input device in your OS sound settings, then try again.'
      );
    } else if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
      showStatus(
        isWindows
          ? 'Microphone permission was denied. Settings → Privacy & security → Microphone → allow Onscreenly, then try again.'
          : 'Microphone permission was denied. System Settings → Privacy & Security → Microphone → allow Onscreenly, then try again.'
      );
    } else if (name === 'NotReadableError' || name === 'TrackStartError') {
      showStatus(
        'The microphone could not be started — another application may be using it exclusively. Close other apps using the mic and try again.'
      );
    } else {
      showStatus('Microphone capture could not be started. Check your mic permissions and try again.');
    }
  }
}
function stopMic() {
  micGen++; // invalidate any startMic() still waiting on getUserMedia
  if (micWorklet) {
    if (micWorklet._legacy) {
      micWorklet.proc.disconnect();
      micWorklet.proc.onaudioprocess = null;
      micWorklet.node.disconnect();
      micWorklet.sink.disconnect();
    } else {
      micWorklet.disconnect();
    }
    micWorklet = null;
  }
  if (audioCtx) {
    audioCtx.close();
    audioCtx = null;
  }
  if (micStream) {
    micStream.getTracks().forEach((t) => t.stop());
    micStream = null;
  }
}

// ---- capture: system/meeting audio (getDisplayMedia loopback, in Onscreenly's process) ----
let sysStream = null,
  sysCtx = null,
  sysWorklet = null,
  sysStarting = false;
async function startSystemAudio() {
  // Called both from the stop-btn click (fresh user gesture for getDisplayMedia) and from the
  // capture:state handler. getDisplayMedia is async, so `if (sysStream) return` alone loses the
  // race and can open a second loopback stream that is then orphaned.
  if (sysStream || sysStarting) return;
  // macOS: asking for meeting audio means asking for a display-capture session, and
  // that session puts the OS screen-recording indicator on the menu bar for the whole
  // call. Default to staying invisible; the user opts in in Settings > Audio.
  if (isMac && !(state.settings && state.settings.meetingAudio)) {
    onscreenly.log('system audio: meeting audio is off on macOS -- no display-capture session opened');
    showAudioStatus(
      'Meeting audio is off. macOS shows a screen-recording indicator whenever an app captures system audio; turn Meeting audio on in Settings \u203a Audio if you want the other side transcribed.'
    );
    return;
  }
  sysStarting = true;
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getDisplayMedia !== 'function') {
    onscreenly.log('system audio unavailable: getDisplayMedia not supported');
    showStatus('Meeting audio capture is not available on this device build.');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });

    stream.getVideoTracks().forEach((t) => t.stop()); // we only want the audio
    const tracks = stream.getAudioTracks();
    if (!tracks.length) {
      onscreenly.log('system audio: no loopback track on this platform');
      stream.getTracks().forEach((t) => t.stop());
      showStatus(
        onscreenly.platform === 'win32'
          ? 'No system-audio loopback track detected. Make sure "Share audio" is checked in the screen share dialog, and that your audio device is not in exclusive mode.'
          : 'No system-audio loopback track detected. Meeting audio needs macOS 14.4+ — your screen and microphone still work.'
      );
      return;
    }
    sysStream = stream;
    sysCtx = new AudioContext({ sampleRate: 16000 });

    // Use AudioWorklet for system audio too
    try {
      await sysCtx.audioWorklet.addModule('audio-worklet-processor.js');
      const source = sysCtx.createMediaStreamSource(new MediaStream(tracks));
      sysWorklet = new AudioWorkletNode(sysCtx, 'onscreenly-audio-processor');
      sysWorklet.port.onmessage = (e) => {
        onscreenly.systemPcm(e.data);
      };
      source.connect(sysWorklet);
      onscreenly.log('system audio: AudioWorklet capturing loopback');
    } catch (workletErr) {
      // Fallback to ScriptProcessor
      onscreenly.log('system audio AudioWorklet failed, using ScriptProcessor: ' + workletErr.message);
      const sysNode = sysCtx.createMediaStreamSource(new MediaStream(tracks));
      const sysProc = sysCtx.createScriptProcessor(4096, 1, 1);
      const sink = sysCtx.createGain();
      sink.gain.value = 0;
      sysNode.connect(sysProc);
      sysProc.connect(sink);
      sink.connect(sysCtx.destination);
      sysProc.onaudioprocess = (e) => {
        const f = e.inputBuffer.getChannelData(0);
        const out = new Int16Array(f.length);
        for (let i = 0; i < f.length; i++) {
          const s = Math.max(-1, Math.min(1, f[i]));
          out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        onscreenly.systemPcm(out.buffer);
      };
      sysWorklet = { _legacy: true, proc: sysProc, node: sysNode, sink };
    }
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    onscreenly.log('system audio error: ' + message);
    showStatus('Meeting audio could not be started. Grant screen/audio access to Onscreenly and try again.');
  } finally {
    sysStarting = false;
  }
}
function stopSystemAudio() {
  if (sysWorklet) {
    if (sysWorklet._legacy) {
      sysWorklet.proc.disconnect();
      sysWorklet.proc.onaudioprocess = null;
      sysWorklet.node.disconnect();
      sysWorklet.sink.disconnect();
    } else {
      sysWorklet.disconnect();
    }
    sysWorklet = null;
  }
  if (sysCtx) {
    sysCtx.close();
    sysCtx = null;
  }
  if (sysStream) {
    sysStream.getTracks().forEach((t) => t.stop());
    sysStream = null;
  }
}

export { startMic, startSystemAudio, stopMic, stopSystemAudio };
