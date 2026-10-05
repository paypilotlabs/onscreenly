// Saving settings and the example conversation.
import { state } from './state.js';
import { $, onscreenly } from './core.js';
import { addUserBubble, clearMessages, messages } from './chat.js';
import { clampOpacity } from './toolbar.js';
import { updateSmartTooltip } from './settings-panel.js';
import { statusText } from './settings-form.js';

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
  // Style tab
  state.settings.aiRules = $('#ai-rules').value.trim();
  // Appearance tab
  const opacitySlider = $('#s-opacity-slider');
  if (opacitySlider) state.settings.opacity = clampOpacity(Number(opacitySlider.value) / 100);
  try {
    state.settings = await onscreenly.settingsSet(state.settings);
    $('#s-status').textContent = statusText();
    updateSmartTooltip();
    return true;
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    $('#s-status').textContent = message;
    $('#base-url').focus();
    return false;
  }
}

// ---- example conversation (matches the reference screenshot) ------------
function showExample() {
  clearMessages();
  addUserBubble('What should I say?');
  const ai = document.createElement('div');
  ai.className = 'ai-text';
  ai.textContent =
    '“A discounted cash flow model values a company by projecting future free cash flows and discounting them to present value using the weighted average cost of capital.”';
  messages.appendChild(ai);
}

export { saveSettings, showExample };
