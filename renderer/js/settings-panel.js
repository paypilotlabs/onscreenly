// Settings panel shell: open/close, tabs, AI-rules counter, smart tooltip and custom provider fields.
import { state } from './state.js';
import { $ } from './core.js';
import { renderPublikBlock } from './publik-settings.js';
import { fillSettings } from './settings-form.js';
import { refreshWhisperModels } from './whisper-settings.js';
import { saveSettings } from './settings-save.js';

// ---- prep status & smart tooltip helpers -------------------------------

// ---- AI rules: live char counter + soft cap ---------------------------
function updateAiRulesCounter() {
  const el = document.getElementById('ai-rules');
  const counter = document.getElementById('ai-rules-count');
  if (!el || !counter) return;
  const n = el.value.length;
  const cap = 2000;
  counter.textContent = String(n);
  counter.classList.toggle('over', n >= cap);
  counter.parentElement.classList.toggle('s-counter-warn', n >= cap - 100);
}
const aiRulesEl = document.getElementById('ai-rules');
function updateSmartTooltip() {
  if (!state.settings) return;
  const m = state.settings.models[state.settings.provider] || { fast: '', smart: '' };
  const fast = (m.fast || '').trim();
  const smart = (m.smart || '').trim();
  const btn = document.getElementById('smart-toggle');
  if (!btn) return;
  const same = fast.toLowerCase() === smart.toLowerCase();
  btn.classList.toggle('hidden', same);
  if (same) return;
  btn.title =
    'Fast: ' + (fast || 'fast model') + ' · Smart: ' + (smart || 'smart model') + ' (higher quality, about 2× slower)';
}

// ---- settings ----------------------------------------------------------
const scrim = $('#settings-scrim');
// `tab` picks the tab to show (keys, profile, knowledge, transcription, style or appearance);
// without one, Settings opens where it was left. Click listeners pass an event, never a tab.
function openSettings(tab) {
  fillSettings();
  scrim.classList.remove('hidden');
  // After the scrim shows: a pane inside a hidden scrim keeps its old scroll position.
  if (typeof tab === 'string') selectTab(tab);
  refreshWhisperModels();
}
// Only hide after a successful save. A second closeSettings used to shadow
// this one and always dismiss the modal, so validation errors (and any
// settings:set throw) vanished with the panel — keys, models, and résumé
// looked saved and then came back empty on the next launch.
let closingSettings = false;
async function closeSettings() {
  if (closingSettings) return;
  closingSettings = true;
  try {
    if (await saveSettings()) scrim.classList.add('hidden');
  } finally {
    closingSettings = false;
  }
}

// Shows one tab's pane. The tabs are a tablist with one tab stop: the selected tab.
function selectTab(name) {
  const tab = document.querySelector(`.s-tab[data-tab="${name}"]`);
  if (!tab) return;
  document.querySelectorAll('.s-tab').forEach((t) => {
    const on = t === tab;
    t.classList.toggle('on', on);
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
  });
  document.querySelectorAll('.s-tab-pane').forEach((p) => p.classList.toggle('hidden', p.dataset.pane !== name));
  const pane = document.querySelector(`.s-tab-pane[data-pane="${name}"]`);
  if (pane) pane.scrollTop = 0;
}

function updateCustomProviderFields() {
  const provider = state.settings.provider;
  document.querySelectorAll('[data-key-for]').forEach((el) => {
    el.classList.toggle('hidden', el.dataset.keyFor !== provider);
  });
  $('#custom-endpoint-settings').classList.toggle('hidden', provider !== 'custom');
  $('#publik-settings').classList.toggle('hidden', provider !== 'publik');
  const minimaxRegionSettings = $('#minimax-region-settings');
  if (minimaxRegionSettings) minimaxRegionSettings.classList.toggle('hidden', provider !== 'minimax');
  const azureEndpointSettings = $('#azure-endpoint-settings');
  if (azureEndpointSettings) azureEndpointSettings.classList.toggle('hidden', provider !== 'azure');
  renderPublikBlock();
}

export function init() {
  if (aiRulesEl) aiRulesEl.addEventListener('input', updateAiRulesCounter);
  $('#more-btn').addEventListener('click', openSettings);
  $('#tb-settings-btn').addEventListener('click', openSettings);
  // The empty state's setup buttons (shown when no provider or no speech-to-text is set up).
  $('#empty-setup').addEventListener('click', () => openSettings());
  $('#empty-audio').addEventListener('click', () => openSettings('transcription'));
  $('#s-close').addEventListener('click', () => {
    void closeSettings();
  });
  scrim.addEventListener('click', (e) => {
    if (e.target === scrim) void closeSettings();
  });

  // Tab switching
  document.querySelectorAll('.s-tab').forEach((tab) => {
    tab.addEventListener('click', async () => {
      if (tab.classList.contains('on')) return;
      if (!(await saveSettings())) return;
      selectTab(tab.dataset.tab);
    });
  });
}

export { closeSettings, openSettings, scrim, updateAiRulesCounter, updateCustomProviderFields, updateSmartTooltip };
