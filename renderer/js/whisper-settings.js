// Local Whisper model list, download, import and delete.
import { state } from './state.js';
import { $, onscreenly } from './core.js';

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const units = ['B', 'KB', 'MB', 'GB'];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** unitIndex;
  return `${value >= 10 || unitIndex < 2 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function getSelectedWhisperModel() {
  if (!state.whisperOverview) return null;
  return state.whisperOverview.models.find((model) => model.id === $('#whisper-model').value) || null;
}

function renderWhisperModelState() {
  const model = getSelectedWhisperModel();
  if (!model) return;
  const language = model.englishOnly ? 'English only' : 'Multilingual';
  const recommendation = model.recommended ? ' · recommended default' : '';
  const partial =
    model.partialBytes > 0 && !model.installed ? ` · ${formatBytes(model.partialBytes)} ready to resume` : '';
  $('#whisper-model-detail').textContent =
    `${formatBytes(model.bytes)} · ${language} · ${model.quantization} · ${model.hardwareTier}${recommendation}${partial}`;

  const progressWrap = $('#whisper-progress-wrap');
  const progressPercent = model.bytes > 0 ? Math.floor((model.partialBytes / model.bytes) * 100) : 0;
  progressWrap.classList.toggle('hidden', !model.downloading);
  $('#whisper-progress').value = progressPercent;
  $('#whisper-progress-label').textContent = `${progressPercent}%`;
  $('#whisper-download').disabled = model.installed || model.downloading;
  $('#whisper-download').textContent = model.installed ? 'Installed' : model.partialBytes ? 'Resume' : 'Download';
  $('#whisper-cancel').classList.toggle('hidden', !model.downloading);
  $('#whisper-import').disabled = model.downloading;
  $('#whisper-delete').disabled = (model.installedBytes === 0 && model.partialBytes === 0) || model.downloading;
}

async function refreshWhisperModels() {
  const status = $('#whisper-status');
  try {
    const previousSelection = $('#whisper-model').value || state.settings.localWhisper?.modelId || 'base.en';
    state.whisperOverview = await onscreenly.whisperModels();
    const runtimeBadge = $('#whisper-runtime-status');
    runtimeBadge.classList.toggle('ready', state.whisperOverview.runtime.available);
    runtimeBadge.classList.toggle('error', !state.whisperOverview.runtime.available);
    runtimeBadge.textContent = state.whisperOverview.runtime.available
      ? `Ready · v${state.whisperOverview.runtime.version} · ${state.whisperOverview.runtime.target}`
      : 'Not prepared';
    runtimeBadge.title = state.whisperOverview.runtime.message || '';

    const select = $('#whisper-model');
    select.innerHTML = '';
    for (const model of state.whisperOverview.models) {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = `${model.label} — ${formatBytes(model.bytes)}${model.recommended ? ' (recommended)' : ''}${model.installed ? ' ✓' : ''}`;
      select.appendChild(option);
    }
    const selectionExists = state.whisperOverview.models.some((model) => model.id === previousSelection);
    select.value = selectionExists ? previousSelection : 'base.en';
    if (!state.settings.localWhisper) state.settings.localWhisper = {};
    state.settings.localWhisper.modelId = select.value;
    status.textContent = state.whisperOverview.runtime.available
      ? 'Model files are verified before they can be loaded.'
      : state.whisperOverview.runtime.message;
    renderWhisperModelState();
  } catch (error) {
    status.textContent = `Could not load local model information: ${error.message}`;
  }
}

export function init() {
  $('#whisper-model').addEventListener('change', () => {
    if (!state.settings.localWhisper) state.settings.localWhisper = {};
    state.settings.localWhisper.modelId = $('#whisper-model').value;
    renderWhisperModelState();
  });

  $('#whisper-download').addEventListener('click', async () => {
    const model = getSelectedWhisperModel();
    if (!model) return;
    model.downloading = true;
    renderWhisperModelState();
    $('#whisper-status').textContent = `Downloading ${model.id}. You can cancel and resume later.`;
    try {
      await onscreenly.whisperModelDownload(model.id);
      $('#whisper-status').textContent = `${model.id} downloaded and verified.`;
    } catch (error) {
      $('#whisper-status').textContent = error.message.includes('cancelled')
        ? `${model.id} download paused. Progress was kept.`
        : `Download failed: ${error.message}`;
    } finally {
      await refreshWhisperModels();
    }
  });

  $('#whisper-cancel').addEventListener('click', async () => {
    const model = getSelectedWhisperModel();
    if (model) await onscreenly.whisperModelCancel(model.id);
  });

  $('#whisper-import').addEventListener('click', async () => {
    const model = getSelectedWhisperModel();
    if (!model) return;
    $('#whisper-status').textContent = `Verifying imported ${model.id}…`;
    try {
      const result = await onscreenly.whisperModelImport(model.id);
      $('#whisper-status').textContent = result.cancelled ? 'Import cancelled.' : `${model.id} imported and verified.`;
    } catch (error) {
      $('#whisper-status').textContent = `Import failed: ${error.message}`;
    } finally {
      await refreshWhisperModels();
    }
  });

  $('#whisper-delete').addEventListener('click', async () => {
    const model = getSelectedWhisperModel();
    if (!model || !window.confirm(`Delete the ${model.id} model (${formatBytes(model.bytes)}) from this computer?`))
      return;
    try {
      await onscreenly.whisperModelDelete(model.id);
      $('#whisper-status').textContent = `${model.id} deleted.`;
    } catch (error) {
      $('#whisper-status').textContent = `Delete failed: ${error.message}`;
    } finally {
      await refreshWhisperModels();
    }
  });

  onscreenly.on('whisper:download-progress', (progress) => {
    if (!state.whisperOverview) return;
    const model = state.whisperOverview.models.find((candidate) => candidate.id === progress.modelId);
    if (!model) return;
    model.partialBytes = progress.receivedBytes;
    model.downloading = true;
    if ($('#whisper-model').value === progress.modelId) {
      $('#whisper-progress-wrap').classList.remove('hidden');
      $('#whisper-progress').value = progress.percent;
      $('#whisper-progress-label').textContent = `${progress.percent}%`;
      $('#whisper-model-detail').textContent =
        `${formatBytes(progress.receivedBytes)} of ${formatBytes(progress.totalBytes)}`;
    }
  });
  onscreenly.on('whisper:models-changed', () => refreshWhisperModels());
}

export { refreshWhisperModels };
