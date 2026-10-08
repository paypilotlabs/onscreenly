// Settings panel shell: open/close, tabs, AI-rules counter, smart tooltip and custom provider fields.
import { state } from './state.js';
import { $ } from './core.js';
import { rememberOpener, restoreFocus, safeFocus } from './a11y.js';
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
const dialog = $('#settings');
// `tab` picks the tab to show (keys, profile, knowledge, transcription, style or appearance);
// without one, Settings opens where it was left. Click listeners pass an event, never a tab.
function openSettings(tab) {
  // Until boot has read the settings there is nothing to fill the form with.
  if (!state.settings) return;
  const wasOpen = !scrim.classList.contains('hidden');
  fillSettings();
  if (!wasOpen) rememberOpener(dialog);
  scrim.classList.remove('hidden');
  // After the scrim shows: a pane inside a hidden scrim keeps its old scroll position.
  if (typeof tab === 'string') selectTab(tab);
  refreshWhisperModels();
  if (!wasOpen) safeFocus(document.querySelector('.s-tab.on'));
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

// Arrow keys, Home and End move between tabs and show each one as it is reached. Moving does not
// save: everything on every tab is saved together when Settings closes.
function onTabKey(e) {
  const tabs = Array.from(document.querySelectorAll('.s-tab'));
  const i = tabs.indexOf(document.activeElement);
  if (i < 0) return;
  const next = {
    ArrowRight: (i + 1) % tabs.length,
    ArrowLeft: (i - 1 + tabs.length) % tabs.length,
    Home: 0,
    End: tabs.length - 1
  }[e.key];
  if (next === undefined) return;
  e.preventDefault();
  selectTab(tabs[next].dataset.tab);
  tabs[next].focus();
}

// closeSettings hides Settings only once a save succeeds, so what has to follow a close (focus going
// back to the opener, onboarding resuming) watches the scrim rather than each way of closing.
const closeHandlers = [() => restoreFocus(dialog)];
function onSettingsClosed(handler) {
  closeHandlers.push(handler);
}
function watchSettingsClose() {
  let open = !scrim.classList.contains('hidden');
  new MutationObserver(() => {
    const nowOpen = !scrim.classList.contains('hidden');
    if (open && !nowOpen) closeHandlers.forEach((handler) => handler());
    open = nowOpen;
  }).observe(scrim, { attributes: true, attributeFilter: ['class'] });
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
  watchSettingsClose();

  // Tab switching. A click also saves what is there so far. A save that fails no longer holds the
  // user on the tab: the footer names the problem and its tab from wherever they are, and holding
  // them would leave no way back to that tab after the arrow keys (which never save) moved away.
  document.querySelectorAll('.s-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      if (tab.classList.contains('on')) return;
      selectTab(tab.dataset.tab);
      void saveSettings();
    });
  });
  $('.s-tabs').addEventListener('keydown', onTabKey);
}

export {
  closeSettings,
  onSettingsClosed,
  openSettings,
  scrim,
  updateAiRulesCounter,
  updateCustomProviderFields,
  updateSmartTooltip
};
