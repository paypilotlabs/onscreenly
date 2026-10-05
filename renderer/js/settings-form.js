// Filling the settings form, app-link callers, the status line and provider selectors.
import { state } from './state.js';
import { $, isMac, onscreenly } from './core.js';
import { applyOpacity } from './toolbar.js';
import { updateAiRulesCounter, updateCustomProviderFields, updateSmartTooltip } from './settings-panel.js';

function fillSettings() {
  // Keys tab
  document
    .querySelectorAll('#provider-seg button')
    .forEach((b) => b.classList.toggle('on', b.dataset.provider === state.settings.provider));
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
  document
    .querySelectorAll('#minimax-region-seg button')
    .forEach((b) => b.classList.toggle('on', b.dataset.region === (state.settings.minimaxRegion || 'global_en')));
  $('#key-azure').value = state.settings.apiKeys.azure || '';
  $('#azure-endpoint').value = state.settings.azureEndpoint || '';
  const m = state.settings.models[state.settings.provider] || { fast: '', smart: '' };
  $('#model-fast').value = m.fast;
  $('#model-smart').value = m.smart;
  fillAppLinkCallers();
  $('#s-status').textContent = statusText();
  // Transcription tab
  document.querySelectorAll('#meeting-audio-seg button').forEach((button) => {
    button.classList.toggle('on', (button.dataset.meetingAudio === 'on') === !!state.settings.meetingAudio);
  });
  const meetingAudioNote = $('#meeting-audio-note');
  if (meetingAudioNote) {
    meetingAudioNote.textContent = isMac
      ? 'macOS can only capture system audio through a screen-capture session. While this is on, the menu bar shows the screen-recording indicator and Control Center lists Onscreenly under \u201cCurrently Sharing\u201d \u2014 visible to everyone you screen-share with. Off by default; your microphone, screen capture and answers are unaffected.'
      : 'Transcribes the other participants alongside your microphone. This platform\u2019s loopback capture shows no recording indicator.';
  }
  document.querySelectorAll('#stt-provider-seg button').forEach((button) => {
    button.classList.toggle('on', button.dataset.sttProvider === (state.settings.sttProvider || 'auto'));
  });
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

// Whoever Onscreenly has been told it may answer questions for. Empty is the normal
// state — nothing appears here until something has asked and been allowed.
async function fillAppLinkCallers() {
  const host = $('#applink-callers');
  if (!host || !onscreenly.appLinkState) return;
  let state;
  try {
    state = await onscreenly.appLinkState();
  } catch (_) {
    return;
  }
  const callers = Object.entries((state && state.callers) || {});
  if (!callers.length) {
    host.innerHTML = '<div class="s-caller-empty">Nothing has asked yet.</div>';
    return;
  }
  host.innerHTML = '';
  for (const [id, scopes] of callers) {
    const allowed = Object.entries(scopes)
      .filter(([, record]) => record && record.decision === 'granted')
      .map(([scope]) => (scope === 'action' ? 'control' : 'read'));
    const name = (scopes.read && scopes.read.callerName) || (scopes.action && scopes.action.callerName) || id;

    const row = document.createElement('div');
    row.className = 's-caller';
    const label = document.createElement('span');
    label.textContent = name + ' — ' + (allowed.length ? allowed.join(' + ') : 'denied');
    label.title = id;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Forget';
    button.addEventListener('click', async () => {
      await onscreenly.appLinkRevoke(id);
      fillAppLinkCallers();
    });
    row.append(label, button);
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
  // 'auto' walks the same fallback chain src/stt.js builds; an explicit choice
  // is reported as-is so the status line matches what will actually be used.
  const selectedSttProvider = state.settings.sttProvider || 'auto';
  const automaticStt = k.openai ? 'OpenAI Realtime' : k.groq ? 'Groq Whisper' : 'none';
  const stt = selectedSttProvider === 'auto' ? automaticStt : selectedSttProvider;
  return `${labels[state.settings.provider] || state.settings.provider}${publikPart} · STT: ${stt}`;
}

export function init() {
  document.querySelectorAll('#provider-seg button').forEach((b) =>
    b.addEventListener('click', () => {
      state.settings.provider = b.dataset.provider;
      document.querySelectorAll('#provider-seg button').forEach((x) => x.classList.toggle('on', x === b));
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
      document.querySelectorAll('#minimax-region-seg button').forEach((x) => x.classList.toggle('on', x === b));
    })
  );
  document.querySelectorAll('#meeting-audio-seg button').forEach((button) =>
    button.addEventListener('click', () => {
      state.settings.meetingAudio = button.dataset.meetingAudio === 'on';
      document.querySelectorAll('#meeting-audio-seg button').forEach((candidate) => {
        candidate.classList.toggle('on', candidate === button);
      });
    })
  );

  document.querySelectorAll('#stt-provider-seg button').forEach((button) =>
    button.addEventListener('click', () => {
      state.settings.sttProvider = button.dataset.sttProvider;
      document.querySelectorAll('#stt-provider-seg button').forEach((candidate) => {
        candidate.classList.toggle('on', candidate === button);
      });
      $('#s-status').textContent = statusText();
    })
  );
}

export { fillSettings, statusText };
