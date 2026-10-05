// Media permission handlers for the renderer's getUserMedia / getDisplayMedia.
const { desktopCapturer, session: electronSession } = require('electron');
const store = require('../../src/storage/store');
const { isMac } = require('./platform');

function installMediaHandlers() {
  const allowMedia = (permission) =>
    permission === 'media' ||
    permission === 'microphone' ||
    permission === 'audioCapture' ||
    permission === 'display-capture' ||
    permission === 'screen';
  electronSession.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(allowMedia(permission)));
  electronSession.defaultSession.setPermissionCheckHandler((_wc, permission) => allowMedia(permission));

  // System-audio loopback for getDisplayMedia: hand back a screen source with 'loopback'
  // audio so the renderer can capture what's playing (Zoom/Meet) using Onscreenly's own grant.
  //
  // Two things are true here and both must hold.
  //
  // 1. `audio` must be the string 'loopback' or 'loopbackWithMute' (or a WebFrameMain).
  // Electron's native binding for this callback rejects anything else, including a
  // plain boolean. Windows used to get `true`, which threw synchronously and surfaced
  // to the renderer as AbortError "Error starting capture" ("Meeting audio could not be
  // started"), and also invoked this one-time `callback` a SECOND time. Never pass a
  // boolean on any platform, and invoke `callback` from exactly one place.
  //
  // 2. On macOS the grant is not free: the only route to system audio is a
  // ScreenCaptureKit session over a real display, so while it is held open macOS paints
  // its screen-recording indicator and names Onscreenly under Control Center's "Currently
  // Sharing" — pixels every screen-share viewer sees. Nothing app-side suppresses it
  // (an audio-only grant is rejected by Chromium; a window source lights the same
  // indicator), so the honest answer is consent: never open that session on macOS
  // unless the user switched Meeting audio on in Settings > Audio. This guard is the
  // enforcement point and holds even if another renderer path calls getDisplayMedia.
  electronSession.defaultSession.setDisplayMediaRequestHandler(
    (_request, callback) => {
      // The macOS consent gate resolves to an empty source list instead of invoking the
      // one-time reply itself, so this handler keeps exactly one invocation site.
      // test/capture/display-media-audio.test.js counts them, because a second site is how the
      // "One-time callback was called more than once" bug happened before.
      const allowed = !isMac || Boolean(store.getSettings().meetingAudio);
      (allowed ? desktopCapturer.getSources({ types: ['screen'] }) : Promise.resolve([]))
        .then((sources) => (sources.length ? { video: sources[0], audio: 'loopback' } : undefined))
        .catch((err) => {
          console.error('[main] system audio: desktopCapturer.getSources failed:', err);
          return undefined;
        })
        .then((request) => callback(request));
    },
    { useSystemPicker: false }
  );
}

module.exports = { installMediaHandlers };
