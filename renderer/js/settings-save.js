// Saving settings.
import { state } from './state.js';
import { $, onscreenly } from './core.js';
import { clampOpacity } from './toolbar.js';
import { updateSmartTooltip } from './settings-panel.js';
import { paintReadiness, setStatus, statusText } from './settings-form.js';
import { readProfile } from './profile-settings.js';
import { readKnowledge } from './knowledge-settings.js';

// "Couldn’t save: …" with main's reason, unwrapped from what ipcRenderer.invoke adds ("Error invoking
// remote method 'settings:set': Error: …"). The field main rejects is the Custom base URL; it sits on
// the API keys tab, which need not be the one showing, so the status names the tab.
function saveErrorText(error) {
  const raw = error && error.message ? error.message : String(error);
  const reason = raw
    .replace(/^Error invoking remote method '[^']*': /, '')
    .replace(/^\w*Error: /, '')
    .replace(/\.$/, '');
  if (/^Base URL\b/.test(reason)) return `Couldn’t save: the Custom base URL${reason.slice(8)} (API keys).`;
  return `Couldn’t save: ${reason}.`;
}

async function saveSettings() {
  // Keys
  state.settings.apiKeys.cerebras = $('#key-cerebras').value.trim();
  state.settings.apiKeys.openai = $('#key-openai').value.trim();
  state.settings.apiKeys.anthropic = $('#key-anthropic').value.trim();
  state.settings.apiKeys.groq = $('#key-groq').value.trim();
  state.settings.apiKeys.custom = $('#key-custom').value.trim();
  state.settings.baseUrl = $('#base-url').value.trim();
  state.settings.apiKeys.gemini = $('#key-gemini').value.trim();
  state.settings.apiKeys.deepgram = $('#key-deepgram').value.trim();
  state.settings.apiKeys.ollama = $('#key-ollama').value.trim();
  state.settings.apiKeys.minimax = $('#key-minimax').value.trim();
  state.settings.apiKeys.deepseek = $('#key-deepseek').value.trim();
  state.settings.apiKeys.azure = $('#key-azure').value.trim();
  state.settings.azureEndpoint = $('#azure-endpoint').value.trim();
  if (!state.settings.models[state.settings.provider]) state.settings.models[state.settings.provider] = {};
  state.settings.models[state.settings.provider].fast = $('#model-fast').value.trim();
  state.settings.models[state.settings.provider].smart = $('#model-smart').value.trim();
  // If the active provider still has no key, but the user just filled in a
  // key for a different provider (without touching the Provider selector —
  // the flow both bug reports describe), switch to that provider. Without
  // this, `settings.provider` stays on its default ('openai') forever and
  // Onscreenly keeps reporting itself unconfigured even though a valid key was
  // saved for the provider the user actually meant to use.
  if (!state.settings.apiKeys[state.settings.provider]) {
    const keyedProviders = ['cerebras', 'openai', 'anthropic', 'gemini', 'groq', 'minimax', 'deepseek', 'azure'];
    const justFilled = keyedProviders.find((p) => state.settings.apiKeys[p]);
    if (justFilled) state.settings.provider = justFilled;
  }
  // Transcription
  if (!state.settings.localWhisper) state.settings.localWhisper = {};
  state.settings.localWhisper.modelId = $('#whisper-model').value || state.settings.localWhisper.modelId || 'base.en';
  state.settings.localWhisper.language = $('#whisper-language').value || 'auto';
  state.settings.localWhisper.threads = Math.max(
    0,
    Math.min(64, Number.parseInt($('#whisper-threads').value, 10) || 0)
  );
  // Slides (opt-in, memory-only)
  if (!state.settings.slides) state.settings.slides = {};
  const slidesEnabledEl = $('#slides-enabled');
  const slidesIntervalEl = $('#slides-interval');
  if (slidesEnabledEl) state.settings.slides.enabled = !!slidesEnabledEl.checked;
  if (slidesIntervalEl) {
    const v = Number.parseInt(slidesIntervalEl.value, 10) || 3000;
    state.settings.slides.intervalMs = Math.max(1500, Math.min(15000, v));
  }
  // Profile and Knowledge tabs
  readProfile();
  readKnowledge();
  // Style tab
  state.settings.aiRules = $('#ai-rules').value.trim();
  // Appearance tab
  const opacitySlider = $('#s-opacity-slider');
  if (opacitySlider) state.settings.opacity = clampOpacity(Number(opacitySlider.value) / 100);
  try {
    state.settings = await onscreenly.settingsSet(state.settings);
    setStatus(`Saved · ${statusText()}`, 'ok');
    updateSmartTooltip();
    paintReadiness();
    return true;
  } catch (error) {
    setStatus(saveErrorText(error), 'error');
    $('#base-url').focus();
    return false;
  }
}

export { saveSettings };
