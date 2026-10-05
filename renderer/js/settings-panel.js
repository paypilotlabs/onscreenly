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
    'Fast: ' + (fast || 'fast model') + ' · Smart: ' + (smart || 'smart model') + ' (higher quality, ~2× slower)';
}

// ---- settings ----------------------------------------------------------
const scrim = $('#settings-scrim');
function openSettings() {
  fillSettings();
  scrim.classList.remove('hidden');
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
      document.querySelectorAll('.s-tab').forEach((t) => t.classList.remove('on'));
      document.querySelectorAll('.s-tab-pane').forEach((p) => p.classList.add('hidden'));
      tab.classList.add('on');
      const pane = document.querySelector(`.s-tab-pane[data-pane="${tab.dataset.tab}"]`);
      if (pane) pane.classList.remove('hidden');
    });
  });
}

export { closeSettings, openSettings, scrim, updateAiRulesCounter, updateCustomProviderFields, updateSmartTooltip };
