// Slides: auto tracking (opt-in, memory-only).
// Cheap hash poll (32px thumbnail) every intervalMs; full-res VLM caption only
// on stable change. Never blocks runFeature (own slideBusy flag). Images are
// never stored — only hash + caption + transcript window.
const { desktopCapturer } = require('electron');
const { handle } = require('./ipc-guard');
const store = require('../../src/storage/store');
const { captureScreenshot } = require('../../src/capture/screen');
const { createLLM } = require('../../src/llm/llm');
const { recordEvent } = require('../../src/integrations/applink');
const {
  hashRGBA,
  shouldEmitSlide,
  createSlideStore,
  clampSlidesConfig,
  buildSlideSystem,
  buildSlideUser,
  DEFAULT_STABLE_REQUIRED
} = require('../../src/capture/slides');
const { session, send } = require('./session');
const { STREAM_INACTIVITY_MS } = require('./llm-runner');

// -------- slides state (memory-only, never written to disk) --------
let slideStore = createSlideStore({ maxSlides: 50 });
let slideTimer = null;
let slideLastHash = null;
let slideStableCount = 0;
let slideBusy = false;
let slideDisabled = false; // set when the chat key rejects slide captions (stops cost spam)
let slideTxCursor = 0; // transcript.length at last emitted slide
let slideGeneration = 0; // bumped by a new or reset deck: a caption from before it is dropped

function getSlidesConfig() {
  return clampSlidesConfig(store.getSettings().slides || {});
}

async function captureHashFrame() {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 32, height: 32 }
  });
  if (!sources.length) return null;
  const img = sources[0].thumbnail;
  if (!img || img.isEmpty()) return null;
  const size = img.getSize();
  const bmp = img.toBitmap();
  if (!bmp || !size.width || !size.height) return null;
  return { width: size.width, height: size.height, data: bmp };
}

async function captionSlide(imageDataUrl, transcriptSlice) {
  const settings = store.getSettings();
  const llm = createLLM(settings);
  if (!llm.ready) throw new Error(llm.configurationError || 'Complete the provider settings.');
  let watchdog = null;
  const stalled = new Promise((_res, reject) => {
    watchdog = setTimeout(() => reject(new Error('slide caption timed out')), STREAM_INACTIVITY_MS);
  });
  try {
    return await Promise.race([
      llm.stream({
        system: buildSlideSystem(),
        turns: [{ role: 'user', text: buildSlideUser(transcriptSlice) }],
        imageDataUrl,
        maxTokens: 300,
        onToken: () => {}
      }),
      stalled
    ]);
  } finally {
    clearTimeout(watchdog);
  }
}

async function pollSlides() {
  if (!session.state.capturing || slideBusy || slideDisabled) return;
  const cfg = getSlidesConfig();
  if (!cfg.enabled) return;
  if (slideStore.count() >= cfg.maxSlides) return;
  let frame = null;
  try {
    frame = await captureHashFrame();
  } catch {
    return;
  }
  if (!frame) return;
  const newHash = hashRGBA(frame.width, frame.height, frame.data);
  if (!newHash) return;
  const decision = shouldEmitSlide(slideLastHash, newHash, {
    threshold: cfg.threshold,
    stableCount: slideStableCount,
    requiredStable: DEFAULT_STABLE_REQUIRED
  });
  slideStableCount = decision.stableCount;
  if (!decision.emit) {
    return;
  }
  slideLastHash = newHash;
  slideStableCount = decision.stableCount;
  // Stable change: take one full-res frame and caption it.
  slideBusy = true;
  const generation = slideGeneration;
  try {
    const imageDataUrl = await captureScreenshot();
    if (!imageDataUrl) return;
    const { transcript } = session;
    const txStart = slideTxCursor;
    const txEnd = transcript.length;
    const slice = transcript.slice(txStart, txEnd).slice(-8);
    const caption = ((await captionSlide(imageDataUrl, slice)) || '').trim();
    if (!caption || generation !== slideGeneration) return; // the deck it belonged to is gone
    const slide = slideStore.add({ hash: newHash, caption, txStart, txEnd });
    slideTxCursor = txEnd;
    send('slides:update', { count: slideStore.count(), last: slide });
    recordEvent({ level: 'info', event: 'slide_captured', msg: 'slide ' + slideStore.count() + ' captioned' });
  } catch (e) {
    const msg = (e && e.message) || String(e);
    if (/429|quota|401|403|model_not_found/i.test(msg)) {
      slideDisabled = true;
      send('status', { message: 'Slide captions paused: ' + msg });
    } else {
      console.log('[slides] caption failed', msg);
    }
  } finally {
    slideBusy = false;
  }
}

function startSlideLoop() {
  stopSlideLoop();
  const cfg = getSlidesConfig();
  slideTimer = setInterval(() => {
    pollSlides().catch(() => {});
  }, cfg.intervalMs);
  if (slideTimer.unref) slideTimer.unref();
}

function stopSlideLoop() {
  if (slideTimer) {
    clearInterval(slideTimer);
    slideTimer = null;
  }
}

// A new listening session starts a fresh slide deck and begins polling.
function startSlidesSession() {
  slideGeneration++;
  slideDisabled = false;
  slideTxCursor = session.transcript.length;
  slideStore = createSlideStore({ maxSlides: getSlidesConfig().maxSlides });
  slideLastHash = null;
  slideStableCount = 0;
  startSlideLoop();
}

function resetSlidesSession() {
  slideGeneration++;
  slideStore.clear();
  slideLastHash = null;
  slideStableCount = 0;
  slideBusy = false;
  slideDisabled = false;
  slideTxCursor = session.transcript.length;
}

function listSlides() {
  return slideStore.list();
}

function registerSlidesIpc() {
  handle('slides:list', () => slideStore.list());
  handle('slides:state', () => ({
    ...getSlidesConfig(),
    count: slideStore.count(),
    polling: !!slideTimer,
    disabled: slideDisabled
  }));
  handle('slides:clear', () => {
    resetSlidesSession();
    send('slides:update', { count: 0, last: null });
    return { ok: true };
  });
}

module.exports = {
  startSlideLoop,
  stopSlideLoop,
  startSlidesSession,
  resetSlidesSession,
  listSlides,
  registerSlidesIpc
};
