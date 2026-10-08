// Filling the settings form, app-link callers, the status line and provider selectors.
import { state } from './state.js';
import { $, isMac, onscreenly } from './core.js';
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
  $('#s-status').textContent = statusText();
  fillProfile();
  fillKnowledge();
  // Transcription tab
  pressChip('#meeting-audio-seg', (b) => (b.dataset.meetingAudio === 'on') === !!state.settings.meetingAudio);
  const meetingAudioNote = $('#meeting-audio-note');
  if (meetingAudioNote) {
    meetingAudioNote.textContent = isMac
      ? 'macOS can only capture system audio through a screen-capture session. While this is on, the menu bar shows the screen-recording indicator and Control Center lists Onscreenly under \u201cCurrently Sharing\u201d \u2014 visible to everyone you screen-share with. Off by default; your microphone, screen capture and answers are unaffected.'
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

function statusText() {
  const k = state.settings.apiKeys;
  const labels = {
    publik: 'publik API',
    cerebras: 'Cerebras',
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    gemini: 'Gemini',
    deepgram: 'Deepgram',
    custom: 'Custom',
    ollama: 'Ollama',
    groq: 'Groq',
    minimax: 'MiniMax',
    deepseek: 'DeepSeek',
    azure: 'Azure AI Foundry'
  };
  const publikPart =
    state.settings.provider === 'publik' && state.publikState
      ? ` · ${state.publikState.connected ? (state.publikState.balanceLabel ? `balance ${state.publikState.balanceLabel}` : 'connected') : 'not set up'}`
      : '';
  // 'auto' walks the same chain src/stt builds (Deepgram, OpenAI Realtime, then the Groq and Gemini
  // batch fallbacks); an explicit choice is reported as-is so the status line matches what is used.
  const selectedSttProvider = state.settings.sttProvider || 'auto';
  const automaticStt = k.deepgram
    ? 'Deepgram'
    : k.openai
      ? 'OpenAI Realtime'
      : k.groq
        ? 'Groq Whisper'
        : k.gemini
          ? 'Gemini'
          : 'none';
  const stt = selectedSttProvider === 'auto' ? automaticStt : selectedSttProvider;
  return `${labels[state.settings.provider] || state.settings.provider}${publikPart} · STT: ${stt}`;
}

export function init() {
  $('#delete-all-data').addEventListener('click', () => {
    onscreenly.deleteAllData().catch(() => {});
  });
  document.querySelectorAll('#provider-seg button').forEach((b) =>
    b.addEventListener('click', () => {
      state.settings.provider = b.dataset.provider;
      pressChip('#provider-seg', (x) => x === b);
      updateCustomProviderFields();
      const m = state.settings.models[state.settings.provider] || { fast: '', smart: '' };
      $('#model-fast').value = m.fast;
      $('#model-smart').value = m.smart;
      $('#s-status').textContent = statusText();
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
      $('#s-status').textContent = statusText();
    })
  );
}

export { fillSettings, statusText };
