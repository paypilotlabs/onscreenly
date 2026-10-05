// First-run onboarding and the publik disclosure/card dialogs.
import { state } from './state.js';
import { $, isWindows, onscreenly } from './core.js';
import { esc } from './chat.js';
import { openSettings } from './settings-panel.js';
import { renderPublikBlock, selectByoProvider } from './publik-settings.js';
import { setIgnore } from './window-behaviour.js';

// ---- onboarding / first-run tutorial -----------------------------------
const obScrim = $('#onboard-scrim');
const permissionHelp = isWindows
  ? 'Onscreenly needs permission to see and hear. Open Windows Privacy & security settings, allow <strong>Microphone</strong> and <strong>Screen recording</strong> for Onscreenly, then come back here.'
  : 'Onscreenly needs two macOS permissions. Click each button, turn <strong>Onscreenly</strong> ON in the window that opens, then come back here.';
const permissionButtons = isWindows
  ? [
      { label: 'Open Microphone settings', action: () => onscreenly.openPane('ms-settings:privacy-microphone') },
      {
        label: 'Open Screen recording settings',
        action: () => onscreenly.openPane('ms-settings:privacy-screenrecorder')
      }
    ]
  : [
      {
        label: 'Open Microphone settings',
        action: () => onscreenly.openPane('x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone')
      },
      {
        label: 'Open Screen Recording settings',
        action: () =>
          onscreenly.openPane('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')
      }
    ];
const assistShortcut = isWindows
  ? '<span class="kbd">Ctrl</span><span class="kbd">⇧</span><span class="kbd">↵</span>'
  : '<span class="kbd">⌘</span><span class="kbd">⇧</span><span class="kbd">↵</span>';
const sayShortcut = isWindows
  ? '<span class="kbd">Ctrl</span> <span class="kbd">↵</span>'
  : '<span class="kbd">⌘</span> <span class="kbd">↵</span>';
const quitShortcut = isWindows
  ? '<span class="kbd">Ctrl</span><span class="kbd">⇧</span><span class="kbd">X</span>'
  : '<span class="kbd">⌘</span><span class="kbd">⇧</span><span class="kbd">X</span>';
const OB_STEPS = [
  {
    icon: '👋',
    title: 'Welcome to Onscreenly',
    body: 'Onscreenly is a private AI copilot that floats over your screen. It can see your screen, hear your meetings, and help you answer questions – with best-effort protection from screen capture.'
  },
  {
    icon: '🔐',
    title: 'Allow Onscreenly to see & hear',
    body:
      permissionHelp +
      '<ul><li><strong>Microphone</strong> – to hear you</li><li><strong>Screen recording</strong> – to see your screen and hear your meeting</li></ul>',
    buttons: permissionButtons
  },
  {
    icon: '⚙️',
    title: 'Connect an AI provider',
    body: 'Onscreenly uses API keys for <span class="hl">Cerebras API</span> and options to enable real-time transcription via a local or hosted transcription model.',
    buttons: [
      {
        label: 'Configure Onscreenly settings',
        action: () => {
          finishOnboard();
          openSettings();
        }
      }
    ]
  },
  {
    icon: '✨',
    title: 'You’re all set',
    body:
      'How to use Onscreenly:<ul><li>' +
      sayShortcut +
      ' — <strong>What should I say?</strong> from the conversation</li><li>' +
      assistShortcut +
      ' — <strong>Smart assist</strong> with whatever\'s on screen or being said</li><li>Click <strong>Start session</strong> in the top bar to start listening to a meeting</li><li>Type a question and press <span class="kbd">↵</span></li></ul>Reopen this guide anytime by clicking the <strong>help</strong> icon in the top bar. Quit with ' +
      quitShortcut +
      '.'
  }
];
// First-run disclosure (R21 §4.3): two disclosures — cost and data path —
// and a visible "use my own key" branch. Copy comes from main (one source).
// Only "Continue" mints a key; Next/Skip never provision.
function publikStep() {
  const c = state.publikState.copy.disclosure;
  return {
    icon: '🪙',
    title: c.title,
    body: () =>
      `${esc(c.intro)}<br><br><strong>Cost.</strong> ${esc(c.cost)}<br><br><strong>Where your prompts go.</strong> ${esc(c.dataPath)}` +
      `<span class="ob-fine">${esc(c.terms)} <a id="ob-publik-terms">publik API terms</a></span>`,
    buttons: [
      {
        label: c.accept,
        action: async () => {
          const btns = $('#ob-buttons').querySelectorAll('button');
          btns.forEach((b) => {
            b.disabled = true;
          });
          state.publikState = await onscreenly.publikAcceptDisclosure();
          state.settings.provider = 'publik';
          renderPublikBlock();
          // CONTRACT §12.1: the card comes right after POST /installs succeeds,
          // with the real balance on it. Nothing is spent before it is seen.
          if (state.publikState.card) {
            showPublikCard();
            return;
          }
          if (obDialog) {
            hideOnboardDialog();
          } else {
            obIndex++;
            renderOnboard();
          }
        }
      },
      {
        label: c.decline,
        action: () => {
          if (obDialog) hideOnboardDialog();
          else finishOnboard();
          openSettings();
          selectByoProvider();
        }
      }
    ]
  };
}
// The first-run card (CONTRACT §12.1), in this order: (a) the balance line
// from the mint response, (b) the one-sentence justification, (c) the
// primary button that opens claim_url — and "Later", which keeps the key
// and the balance. Everything is painted from publikState.card (src/publik.js
// ctaView), so the copy has one source and the link rule is tested there.
function publikCardStep() {
  const card = state.publikState.card;
  const done = async () => {
    state.publikState = await onscreenly.publikCardSeen();
    renderPublikBlock();
    const idx = OB_STEPS.findIndex((st) => st.publikCard);
    if (idx >= 0) OB_STEPS.splice(idx, 1);
    if (obDialog) {
      hideOnboardDialog();
      return;
    }
    if (obIndex >= OB_STEPS.length) finishOnboard();
    else renderOnboard();
  };
  const buttons = [];
  if (card.primary) {
    buttons.push({
      label: card.primary.label,
      primary: true,
      action: async () => {
        onscreenly.publikOpen(card.primary.url);
        await done();
      }
    });
  }
  buttons.push({ label: card.secondary.label, action: done });
  return {
    icon: '✅',
    title: card.title,
    body: () =>
      `<div class="publik-card-balance">${esc(card.balance)}</div><div class="publik-card-why">${esc(card.why)}</div>`,
    buttons,
    publikCard: true
  };
}
let obDialog = false;
function showPublikDisclosure() {
  if (!state.publikState || !state.publikState.available) return;
  const idx = OB_STEPS.findIndex((st) => st.publik);
  if (idx < 0) return;
  obDialog = true;
  $('#onboard').classList.add('dialog');
  obIndex = idx;
  renderOnboard();
  obScrim.classList.remove('hidden');
  setIgnore(false);
}
// Show the card: inside onboarding it becomes the next step; afterwards it
// is a dialog of its own (also reached from the "never a silent starter"
// gate in app/main/llm-runner.js runFeature).
function showPublikCard() {
  if (!state.publikState || !state.publikState.card) return;
  const existing = OB_STEPS.findIndex((st) => st.publikCard);
  if (existing >= 0) OB_STEPS.splice(existing, 1);
  const inOnboarding = !obScrim.classList.contains('hidden') && !obDialog;
  if (inOnboarding) {
    const idx = OB_STEPS.findIndex((st) => st.publik);
    OB_STEPS.splice(idx + 1, 0, publikCardStep());
    obIndex = idx + 1;
    renderOnboard();
    return;
  }
  OB_STEPS.push(publikCardStep());
  obDialog = true;
  $('#onboard').classList.add('dialog');
  obIndex = OB_STEPS.length - 1;
  renderOnboard();
  obScrim.classList.remove('hidden');
  setIgnore(false);
}
function hideOnboardDialog() {
  obDialog = false;
  $('#onboard').classList.remove('dialog');
  obScrim.classList.add('hidden');
}

let obIndex = 0;
function renderOnboard() {
  const step = OB_STEPS[obIndex];
  $('#ob-icon').textContent = step.icon;
  $('#ob-title').textContent = step.title;
  $('#ob-body').innerHTML = typeof step.body === 'function' ? step.body() : step.body;
  const termsLink = $('#ob-publik-terms');
  if (termsLink) termsLink.addEventListener('click', () => onscreenly.publikOpen(state.publikState.links.terms));
  const btns = $('#ob-buttons');
  btns.innerHTML = '';
  (step.buttons || []).forEach((b) => {
    const el = document.createElement('button');
    el.textContent = b.label;
    if (b.primary) el.classList.add('ob-cta');
    el.addEventListener('click', b.action);
    btns.appendChild(el);
  });
  // The publik card has its own two buttons and no Next/Skip: leaving it any
  // other way would spend the starter without the card being acknowledged.
  $('#onboard').classList.toggle('card', !!step.publikCard);
  const dots = $('#ob-dots');
  dots.innerHTML = '';
  OB_STEPS.forEach((_, i) => {
    const d = document.createElement('span');
    if (i === obIndex) d.className = 'on';
    dots.appendChild(d);
  });
  $('#ob-back').style.visibility = obIndex === 0 ? 'hidden' : 'visible';
  $('#ob-next').textContent = obIndex === OB_STEPS.length - 1 ? 'Done' : 'Next';
  $('#ob-skip').style.visibility = obIndex === OB_STEPS.length - 1 ? 'hidden' : 'visible';
}
function showOnboard() {
  obDialog = false;
  $('#onboard').classList.remove('dialog');
  obIndex = 0;
  renderOnboard();
  obScrim.classList.remove('hidden');
  setIgnore(false);
}
async function finishOnboard() {
  if (obDialog) {
    hideOnboardDialog();
    return;
  }
  obScrim.classList.add('hidden');
  if (state.settings && !state.settings.onboarded) {
    state.settings.onboarded = true;
    await onscreenly.settingsSet({ onboarded: true });
  }
}

export function init() {
  $('#ob-next').addEventListener('click', () => {
    if (obIndex === OB_STEPS.length - 1) finishOnboard();
    else {
      obIndex++;
      renderOnboard();
    }
  });
  $('#ob-back').addEventListener('click', () => {
    if (obIndex > 0) {
      obIndex--;
      renderOnboard();
    }
  });
  $('#ob-skip').addEventListener('click', finishOnboard);
  $('#logo-btn').addEventListener('click', showOnboard);
}

export { OB_STEPS, publikStep, showOnboard, showPublikCard, showPublikDisclosure };
