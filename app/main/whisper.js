// Local Whisper: model management and the on-device transcriber.
const { app, dialog } = require('electron');
const { handle } = require('./ipc-guard');
const { WhisperModelManager } = require('../../src/whisper/whisper-model-manager');
const { requireWhisperModel } = require('../../src/whisper/whisper-model-catalog');
const { locateWhisperRuntime } = require('../../src/whisper/whisper-runtime');
const { LocalWhisperTranscriber } = require('../../src/whisper/local-whisper-transcriber');
const { session, send, publishTranscript } = require('./session');
const { getWin } = require('./window');

let whisperModelManager = null;
let localWhisperTranscriber = null;
let activeWhisperModelId = null;

function initWhisper(userDataPath) {
  whisperModelManager = new WhisperModelManager({ userDataPath });
}

function getTranscriber() {
  return localWhisperTranscriber;
}

// Hands the running transcriber to the caller and forgets it, so a stop that is
// still in flight cannot be raced by a new start.
function takeTranscriber() {
  const transcriber = localWhisperTranscriber;
  localWhisperTranscriber = null;
  return transcriber;
}

function clearActiveModel() {
  activeWhisperModelId = null;
}

function getWhisperRuntime() {
  return locateWhisperRuntime({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    appPath: app.getAppPath(),
    platform: process.platform,
    architecture: process.arch,
    environment: process.env
  });
}

async function startLocalWhisper(settings) {
  if (!whisperModelManager) throw new Error('The local Whisper model manager is not ready.');
  const localSettings = settings.localWhisper || {};
  const model = requireWhisperModel(localSettings.modelId || 'base.en');
  const runtime = getWhisperRuntime();
  if (!runtime.available) throw new Error(runtime.message);
  activeWhisperModelId = model.id;
  let transcriber = null;
  try {
    const modelPath = await whisperModelManager.verifyInstalledModel(model.id).catch((error) => {
      if (error.code === 'ENOENT') {
        throw new Error(`Download the ${model.id} model in Settings → Audio before listening.`);
      }
      throw error;
    });

    transcriber = new LocalWhisperTranscriber({
      sessionOptions: {
        executablePath: runtime.executablePath,
        runtimeDirectory: runtime.runtimeDirectory,
        modelPath,
        language: model.englishOnly ? 'en' : localSettings.language || 'auto',
        threads: Number(localSettings.threads) || 0,
        tinydiarize: model.tinydiarize
      },
      onTranscript: publishTranscript,
      onSpeechState: (channel, speaking, durationMs) => {
        send('vad:state', { channel, speaking, durationMs });
      },
      onStatus: (status) => send('stt:status', { provider: 'local', ...status }),
      onError: (error) => {
        session.sttDisabled = true;
        console.log('[local-whisper] error', error && error.message);
        send('stt:status', { provider: 'local', status: 'error' });
        send('status', {
          message: `Local transcription error: ${error.message}. Audio was not sent to a cloud fallback.`
        });
      }
    });

    localWhisperTranscriber = transcriber;
    await transcriber.start();
  } catch (error) {
    if (localWhisperTranscriber === transcriber) localWhisperTranscriber = null;
    activeWhisperModelId = null;
    if (transcriber) await transcriber.forceStop().catch(() => {});
    throw error;
  }
}

async function getWhisperOverview() {
  if (!whisperModelManager) throw new Error('The local Whisper model manager is not ready.');
  const runtime = getWhisperRuntime();
  const models = await whisperModelManager.listModels();
  return {
    runtime: {
      available: runtime.available,
      version: runtime.version,
      target: runtime.target,
      message: runtime.message || null
    },
    models
  };
}

// Called on quit: never leave a download or a whisper process behind.
function shutdownWhisper() {
  if (whisperModelManager?.activeDownload) {
    whisperModelManager.cancelDownload(whisperModelManager.activeDownload.modelId);
  }
  if (localWhisperTranscriber) localWhisperTranscriber.forceStop().catch(() => {});
}

function registerWhisperIpc() {
  handle('whisper:models', () => getWhisperOverview());
  handle('whisper:model-download', async (_event, modelId) => {
    if (!whisperModelManager) throw new Error('The local Whisper model manager is not ready.');
    const result = await whisperModelManager.download(modelId, (progress) =>
      send('whisper:download-progress', progress)
    );
    send('whisper:models-changed', { modelId });
    return result;
  });
  handle('whisper:model-cancel', (_event, modelId) => {
    if (!whisperModelManager) return false;
    return whisperModelManager.cancelDownload(modelId);
  });
  handle('whisper:model-delete', async (_event, modelId) => {
    requireWhisperModel(modelId);
    if (activeWhisperModelId === modelId) {
      throw new Error('Stop listening before deleting the active model.');
    }
    const result = await whisperModelManager.deleteModel(modelId);
    send('whisper:models-changed', { modelId });
    return result;
  });
  handle('whisper:model-import', async (_event, modelId) => {
    if (!whisperModelManager) throw new Error('The local Whisper model manager is not ready.');
    requireWhisperModel(modelId);
    if (activeWhisperModelId === modelId) {
      throw new Error('Stop listening before replacing the active model.');
    }
    const selection = await dialog.showOpenDialog(getWin(), {
      title: `Import ggml-${modelId}.bin`,
      properties: ['openFile'],
      filters: [{ name: 'whisper.cpp model', extensions: ['bin'] }]
    });
    if (selection.canceled || !selection.filePaths[0]) return { cancelled: true };
    const result = await whisperModelManager.importModel(modelId, selection.filePaths[0]);
    send('whisper:models-changed', { modelId });
    return result;
  });
}

module.exports = {
  initWhisper,
  getTranscriber,
  takeTranscriber,
  clearActiveModel,
  startLocalWhisper,
  shutdownWhisper,
  registerWhisperIpc
};
