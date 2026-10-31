// Filling the settings form, app-link callers, the status line and provider selectors.
import { state } from './state.js';
import { $, isMac, onscreenly, setButtonKind } from './core.js';
import { applyOpacity } from './toolbar.js';
import { updateAiRulesCounter, updateCustomProviderFields, updateSmartTooltip } from './settings-panel.js';
import { fillProfile } from './profile-settings.js';
import { fillKnowledge } from './knowledge-settings.js';

// A chip group (provider, MiniMax region, speech-to-text, meeting audio): one chip is pressed.
function pressChip(group, isOn) {
  document.querySelectorAll(`${group} button`).forEach((button) => {
    const on = isOn(button);
    button.classList.toggle('on', on);
    button.setAttribute('aria-pressed', String(on));
  });
}

function fillSettings() {
  // Keys tab
  pressChip('#provider-seg', (b) => b.dataset.provider === state.settings.provider);
  $('#key-cerebras').value = state.settings.apiKeys.cerebras || '';
  $('#key-openai').value = state.settings.apiKeys.openai || '';
  $('#key-anthropic').value = state.settings.apiKeys.anthropic || '';
  $('#key-groq').value = state.settings.apiKeys.groq || '';
  $('#key-custom').value = state.settings.apiKeys.custom || '';
  $('#base-url').value = state.settings.baseUrl || '';
  updateCustomProviderFields();
  $('#key-gemini').value = state.settings.apiKeys.gemini || '';
  $('#key-deepgram').value = state.settings.apiKeys.deepgram || '';
  $('#key-ollama').value = state.settings.apiKeys.ollama || '';
  $('#key-minimax').value = state.settings.apiKeys.minimax || '';
  $('#key-deepseek').value = state.settings.apiKeys.deepseek || '';
  pressChip('#minimax-region-seg', (b) => b.dataset.region === (state.settings.minimaxRegion || 'global_en'));
  $('#key-azure').value = state.settings.apiKeys.azure || '';
  $('#azure-endpoint').value = state.settings.azureEndpoint || '';
  const m = state.settings.models[state.settings.provider] || { fast: '', smart: '' };
  $('#model-fast').value = m.fast;
  $('#model-smart').value = m.smart;
  fillAppLinkCallers();
  fillKeyStorageNote();
  setStatus(statusText());
  fillProfile();
  fillKnowledge();
  // Transcription tab
  pressChip('#meeting-audio-seg', (b) => (b.dataset.meetingAudio === 'on') === !!state.settings.meetingAudio);
  const meetingAudioNote = $('#meeting-audio-note');
  if (meetingAudioNote) {
    meetingAudioNote.textContent = isMac
      ? 'Needs macOS\u2019s System Audio Recording permission (Privacy & Security \u203a Screen & System Audio Recording); macOS asks the first time and may show its recording indicator while this is on. Off by default; your microphone, screen capture and answers are unaffected.'
      : 'Transcribes the other participants alongside your microphone. This platform\u2019s loopback capture shows no recording indicator.';
  }
  pressChip('#stt-provider-seg', (b) => b.dataset.sttProvider === (state.settings.sttProvider || 'auto'));
  const localWhisper = state.settings.localWhisper || { modelId: 'base.en', language: 'auto', threads: 0 };
  $('#whisper-language').value = localWhisper.language || 'auto';
  $('#whisper-threads').value = Number(localWhisper.threads) || 0;
  // Slides tab (inside Transcription pane)
  const slidesCfg = state.settings.slides || { enabled: false, intervalMs: 3000 };
  const slidesEnabled = $('#slides-enabled');
  if (slidesEnabled) slidesEnabled.checked = !!slidesCfg.enabled;
  const slidesInterval = $('#slides-interval');
  if (slidesInterval) slidesInterval.value = slidesCfg.intervalMs || 3000;
  // Style tab
  $('#ai-rules').value = state.settings.aiRules || '';
  updateAiRulesCounter();
  // Appearance tab
  applyOpacity(state.settings.opacity, false);
}

// How saved API keys are protected on this computer (see src/storage/secrets.js).
async function fillKeyStorageNote() {
  const note = $('#key-storage-note');
  if (!note || !onscreenly.keyStorageStatus) return;
  try {
    const status = await onscreenly.keyStorageStatus();
    note.textContent = status.message;
    note.classList.toggle('warn', !status.protected);
  } catch (_) {
    note.textContent = '';
  }
}

// Whoever Onscreenly has been told it may answer questions for. Empty is the normal
// state — nothing appears here until something has asked and been allowed.
async function fillAppLinkCallers() {
  const host = $('#applink-callers');
  if (!host || !onscreenly.appLinkState) return;
  let consent;
  try {
    consent = await onscreenly.appLinkState();
  } catch (_) {
    return;
  }
  const callers = Object.entries((consent && consent.callers) || {});
  if (!callers.length) {
    host.innerHTML = '<div class="s-caller-empty">Nothing has asked yet.</div>';
    return;
  }
  host.innerHTML = '';
  // One row per program: its name, what it may do as a tag, and Forget.
  for (const [id, scopes] of callers) {
    const granted = (scope) => scopes[scope] && scopes[scope].decision === 'granted';
    const allowed = [granted('read') && 'read', granted('action') && 'control'].filter(Boolean).join(' + ');
    const name = (scopes.read && scopes.read.callerName) || (scopes.action && scopes.action.callerName) || id;

    const row = document.createElement('div');
    row.className = 's-caller';
    const label = document.createElement('span');
    label.className = 's-caller-name';
    label.textContent = name;
    label.title = id;
    const scope = document.createElement('span');
    scope.className = 'tag s-caller-scope';
    scope.textContent = allowed ? allowed.charAt(0).toUpperCase() + allowed.slice(1) : 'Denied';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-ghost compact';
    button.textContent = 'Forget';
    button.addEventListener('click', async () => {
      await onscreenly.appLinkRevoke(id);
      fillAppLinkCallers();
    });
    row.append(label, scope, button);
    host.append(row);
  }
}

// The footer status, seen from every tab: what is set up, "Saved · …" after a save, or why a save
// failed. The tone draws its dot (workspace.css).
function setStatus(text, tone = null) {
  const status = $('#s-status');
  status.textContent = text;
  status.classList.toggle('is-ok', tone === 'ok');
  status.classList.toggle('is-error', tone === 'error');
}

const PROVIDER_NAMES = {
  publik: 'publik API',
  cerebras: 'Cerebras',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Gemini',
  custom: 'Custom',
  ollama: 'Ollama',
  groq: 'Groq',
  minimax: 'MiniMax',
  deepseek: 'DeepSeek',
  azure: 'Azure AI Foundry'
};

function providerName(provider) {
  return PROVIDER_NAMES[provider] || provider;
}

const STT_NAMES = {
  local: 'Local model',
  deepgram: 'Deepgram',
  openai: 'OpenAI',
  groq: 'Groq',
  gemini: 'Gemini',
  custom: 'Custom'
};

// The speech-to-text a session would use. 'auto' walks the same chain src/stt builds (Deepgram,
// OpenAI Realtime, then the Groq and Gemini batch fallbacks); an explicit choice is named as it is.
function sttName(settings) {
  const k = settings.apiKeys || {};
  const choice = settings.sttProvider || 'auto';
  if (choice !== 'auto') return STT_NAMES[choice] || choice;
  if (k.deepgram) return 'Deepgram';
  if (k.openai) return 'OpenAI Realtime';
  if (k.groq) return 'Groq Whisper';
  return k.gemini ? 'Gemini' : 'none';
}

function statusText() {
  const publikPart =
    state.settings.provider === 'publik' && state.publikState
      ? ` · ${state.publikState.connected ? (state.publikState.balanceLabel ? `balance ${state.publikState.balanceLabel}` : 'connected') : 'not set up'}`
      : '';
  return `${providerName(state.settings.provider)}${publikPart} · STT: ${sttName(state.settings)}`;
}

// ---- readiness -------------------------------------------------------------
// What the empty state offers depends on two things: whether answers can work, and whether a session
// can hear anything. Both are read from the settings as saved, so they are hints, not guarantees.

// Answers: the chosen provider has what src/llm/llm.js needs to start. Saved keys arrive masked.
function providerLooksReady(settings = state.settings) {
  const provider = settings.provider;
  const keys = settings.apiKeys || {};
  if (provider === 'publik') {
    return !!(state.publikState ? state.publikState.connected : settings.publik && settings.publik.connected);
  }
  // Ollama is a local server: its field holds a URL, and no key is needed.
  if (provider === 'ollama') return true;
  if (provider === 'custom') {
    const models = (settings.models && settings.models.custom) || {};
    return !!settings.baseUrl && !!(settings.smart ? models.smart : models.fast);
  }
  if (provider === 'azure') return !!keys.azure && !!settings.azureEndpoint;
  return !!keys[provider];
}

// Listening: 'none' when nothing can transcribe a session (src/stt picks from the same keys),
// 'mic-only' on macOS while Meeting audio is off, otherwise 'ready'. A local model whose state is
// not known yet counts as ready, so the app never warns about something it hasn't checked.
function listenReadiness(settings, whisperOverview) {
  const keys = settings.apiKeys || {};
  const choice = settings.sttProvider || 'auto';
  let canTranscribe;
  if (choice === 'local') canTranscribe = localModelReady(settings, whisperOverview);
  else if (choice === 'auto') canTranscribe = ['deepgram', 'openai', 'groq', 'gemini'].some((p) => keys[p]);
  else if (choice === 'custom') canTranscribe = !!keys.custom && !!settings.baseUrl;
  else canTranscribe = !!keys[choice];
  if (!canTranscribe) return 'none';
  return isMac && !settings.meetingAudio ? 'mic-only' : 'ready';
}

// The chosen local model is downloaded and the runtime that runs it is available.
function localModelReady(settings, whisperOverview) {
  if (!whisperOverview) return true;
  const modelId = (settings.localWhisper && settings.localWhisper.modelId) || 'base.en';
  const model = whisperOverview.models.find((candidate) => candidate.id === modelId);
  return !!whisperOverview.runtime.available && !!(model && model.installed);
}

// #panel[data-setup] and [data-listen] pick the empty state (overlay.css).
function paintReadiness() {
  if (!state.settings) return;
  const panel = $('#panel');
  panel.dataset.setup = String(!providerLooksReady());
  panel.dataset.listen = listenReadiness(state.settings, state.whisperOverview);
  // With nothing to transcribe, downloading a local model is the Audio tab's main action.
  setButtonKind($('#whisper-download'), panel.dataset.listen === 'none' ? 'primary' : 'secondary');
}

export function init() {
  $('#delete-all-data').addEventListener('click', () => {
    onscreenly.deleteAllData().catch(() => {});
  });
  document.querySelectorAll('#provider-seg button').forEach((b) =>
    b.addEventListener('click', () => {
      // Keep the model names typed for the provider being left, so coming back shows them again.
      const leaving = state.settings.provider;
      if (leaving && leaving !== b.dataset.provider) {
        state.settings.models[leaving] = {
          ...(state.settings.models[leaving] || {}),
          fast: $('#model-fast').value.trim(),
          smart: $('#model-smart').value.trim()
        };
      }
      state.settings.provider = b.dataset.provider;
      pressChip('#provider-seg', (x) => x === b);
      updateCustomProviderFields();
      const m = state.settings.models[state.settings.provider] || { fast: '', smart: '' };
      $('#model-fast').value = m.fast;
      $('#model-smart').value = m.smart;
      setStatus(statusText());
      updateSmartTooltip();
    })
  );
  document.querySelectorAll('#minimax-region-seg button').forEach((b) =>
    b.addEventListener('click', () => {
      state.settings.minimaxRegion = b.dataset.region;
      pressChip('#minimax-region-seg', (x) => x === b);
    })
  );
  document.querySelectorAll('#meeting-audio-seg button').forEach((button) =>
    button.addEventListener('click', () => {
      state.settings.meetingAudio = button.dataset.meetingAudio === 'on';
      pressChip('#meeting-audio-seg', (candidate) => candidate === button);
    })
  );

  document.querySelectorAll('#stt-provider-seg button').forEach((button) =>
    button.addEventListener('click', () => {
      state.settings.sttProvider = button.dataset.sttProvider;
      pressChip('#stt-provider-seg', (candidate) => candidate === button);
      setStatus(statusText());
    })
  );
}

export {
  fillSettings,
  listenReadiness,
  paintReadiness,
  providerLooksReady,
  providerName,
  setStatus,
  statusText,
  sttName
};
