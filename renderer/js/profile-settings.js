// Settings › Profile: résumé, target job and interview-prep answers, file
// import, and the "Analyse my résumé" action.
import { state } from './state.js';
import { $, onscreenly, setButtonKind } from './core.js';
import { runMode } from './chat.js';
import { closeSettings, scrim } from './settings-panel.js';

// Element id → settings field. The store already had these fields; this tab
// is where the user fills them in.
const PROFILE_FIELDS = [
  ['#resume-text', 'resumeText'],
  ['#job-description', 'jobDescription'],
  ['#star-stories', 'starStories'],
  ['#why-company', 'whyCompany'],
  ['#why-leaving', 'whyLeaving'],
  ['#work-style', 'workStyle'],
  ['#salary-target', 'salaryTarget'],
  ['#questions-to-ask', 'questionsToAsk']
];

// The pane's primary action: Import while the résumé is empty, Analyse once it has text.
function updateAnalyseButton() {
  const hasText = !!$('#resume-text').value.trim();
  $('#resume-analyse').disabled = !hasText;
  setButtonKind($('#resume-import'), hasText ? 'secondary' : 'primary');
  setButtonKind($('#resume-analyse'), hasText ? 'primary' : 'secondary');
}

function fillProfile() {
  for (const [selector, key] of PROFILE_FIELDS) $(selector).value = state.settings[key] || '';
  $('#profile-status').textContent = '';
  updateAnalyseButton();
}

function readProfile() {
  for (const [selector, key] of PROFILE_FIELDS) state.settings[key] = $(selector).value.trim();
}

async function importInto(selector) {
  const status = $('#profile-status');
  status.textContent = 'Reading file…';
  let result;
  try {
    result = await onscreenly.pickProfileDocument();
  } catch (error) {
    result = { error: error && error.message ? error.message : String(error) };
  }
  if (!result || result.canceled) {
    status.textContent = '';
    return;
  }
  if (result.error) {
    status.textContent = 'Could not read that file: ' + result.error;
    return;
  }
  if (!result.text) {
    status.textContent = `${result.fileName} has no text to read. A scanned PDF needs OCR first.`;
    return;
  }
  $(selector).value = result.text;
  status.textContent = `Imported ${result.fileName} (${result.text.length.toLocaleString()} characters). It is saved when you close Settings.`;
  updateAnalyseButton();
}

export function init() {
  $('#resume-text').addEventListener('input', updateAnalyseButton);
  $('#resume-import').addEventListener('click', () => importInto('#resume-text'));
  $('#jd-import').addEventListener('click', () => importInto('#job-description'));
  $('#resume-analyse').addEventListener('click', async () => {
    if (!$('#resume-text').value.trim()) return;
    // Save first so the main process analyses what is on screen, then show
    // the analysis in the answer panel.
    await closeSettings();
    if (scrim.classList.contains('hidden')) runMode('resumeAnalysis', '');
  });
}

export { fillProfile, readProfile };
