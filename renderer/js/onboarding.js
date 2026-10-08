// First-run onboarding and the publik disclosure/card dialogs.
import { state } from './state.js';
import { $, isMac, isWindows, kbd, onscreenly, setButtonKind } from './core.js';
import { esc } from './chat.js';
import { openSettings } from './settings-panel.js';
import { renderPublikBlock, selectByoProvider } from './publik-settings.js';
import { setIgnore } from './window-behaviour.js';

// ---- onboarding / first-run tutorial -----------------------------------
// Each step fills the dialog's head (eyebrow, title, lede), its body, the body's buttons, and the
// footer: Skip, "Step n of 4" with decorative dots, Back and Next. One blue button per view: when
// the body has the primary action (bodyPrimary), Next is secondary.
const obScrim = $('#onboard-scrim');
const isLinux = !isMac && !isWindows;

// Windows 10 has no screen-capture permission (its settings page exists only on Windows 11);
// boot.js sets this once it knows the build.
let windows10 = false;
function setWindows10(value) {
  windows10 = value;
}

// The system settings page behind each "Open settings" button. Linux asks for neither permission.
const PERMISSION_PANES = isWindows
  ? { mic: 'ms-settings:privacy-microphone', screen: 'ms-settings:privacy-screenrecorder' }
  : isMac
    ? {
        mic: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
        screen: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
      }
    : null;

// A row in a Frost row group: a name, a line under it, and an "Open settings" button when the
// platform has a settings page for it (the button names the page for assistive tech).
function permissionRow(perm, name, sub, page) {
  const open = PERMISSION_PANES
    ? `<button type="button" class="btn btn-secondary compact ob-perm-open" data-open-pane="${PERMISSION_PANES[perm]}" aria-label="Open ${page} settings">Open settings</button>`
    : '';
  return (
    `<div class="ws-row ob-perm-row" data-perm="${perm}"><div class="ws-row-info">` +
    `<div class="ws-row-name">${name}</div><div class="ws-row-sub">${sub}</div></div>${open}</div>`
  );
}

function permissionsBody() {
  const rows =
    permissionRow('mic', 'Microphone', 'To hear you', 'Microphone') +
    (windows10 ? '' : permissionRow('screen', 'Screen recording', 'To see your screen', 'Screen Recording'));
  const note = isMac
    ? 'Meeting audio (the other side of a call) is off by default on macOS, because the system shows a recording indicator while it runs. Turn it on in Settings › Audio.'
    : windows10
      ? 'Screen capture needs no permission on Windows 10.'
      : isLinux
        ? 'Linux doesn’t ask for these permissions. If your desktop blocks screen capture, allow it in its privacy settings.'
        : '';
  return `<div class="ob-rows ws-rows">${rows}</div>` + (note ? `<p class="ob-note">${note}</p>` : '');
}

function needRow(need, name, sub) {
  return (
    `<div class="ws-row ob-need-row" data-need="${need}"><div class="ws-row-info">` +
    `<div class="ws-row-name">${name}</div><div class="ws-row-sub">${sub}</div></div></div>`
  );
}

const SHORTCUTS = [
  ['Start or end a session', ['mod', 'shift', 'L']],
  ['What should I say?', ['mod', '↵']],
  ['Assist', ['mod', 'shift', '↵']],
  ['Solve the coding problem on screen', ['mod', 'H']],
  ['Hide or show', ['mod', 'shift', '/']]
];

const OB_STEPS = [
  {
    hero: true,
    title: 'Welcome to Onscreenly',
    lede: 'A quiet AI copilot that floats over your screen.',
    body: () =>
      '<dl class="ob-features">' +
      '<div class="ob-feature"><dt class="ob-feature-key">Screen</dt><dd>Sees your screen when you ask</dd></div>' +
      `<div class="ob-feature"><dt class="ob-feature-key">Audio</dt><dd>${
        isMac
          ? 'Hears you once you start a session, and the other side when Meeting audio is on'
          : 'Hears the conversation once you start a session'
      }</dd></div>` +
      '<div class="ob-feature"><dt class="ob-feature-key">Answers</dt><dd>Suggests what to say next</dd></div>' +
      '</dl>' +
      '<p class="ob-caveat">It tries to stay out of screen shares, but that is best effort, so check before you rely on it.</p>'
  },
  {
    eyebrow: 'Permissions',
    title: 'Let Onscreenly see and hear',
    lede: 'Onscreenly needs to hear the conversation and see your screen to answer.',
    body: permissionsBody
  },
  {
    eyebrow: 'AI provider',
    title: 'Connect an AI provider',
    lede: 'Answers come from the provider you choose, with your own API key.',
    body: () =>
      '<div class="ob-rows ws-rows ob-needs">' +
      needRow('answers', 'Answers', 'An API key for the provider you choose') +
      needRow(
        'listening',
        'Listening',
        'Speech-to-text: a Deepgram, OpenAI, Groq or Gemini key, or a free local model you download in Settings › Audio'
      ) +
      '</div>',
    bodyPrimary: true,
    buttons: [
      {
        label: 'Open Settings',
        kind: 'primary',
        action: () => {
          finishOnboard();
          openSettings('keys');
        }
      }
    ]
  },
  {
    eyebrow: 'Shortcuts',
    title: 'You’re all set',
    lede: 'Reopen this guide from Help in the toolbar.',
    body: () =>
      '<div class="ob-rows ws-rows ob-keys">' +
      SHORTCUTS.map(
        ([label, keys]) =>
          `<div class="ws-row ob-key-row"><span class="ob-key-label">${label}</span><span class="ob-keycaps">${kbd(...keys)}</span></div>`
      ).join('') +
      '</div>',
    buttons: [
      {
        label: 'Add your résumé',
        kind: 'secondary',
        action: () => {
          finishOnboard();
          openSettings('profile');
        }
      },
      {
        label: 'Connect Obsidian notes',
        kind: 'secondary',
        action: () => {
          finishOnboard();
          openSettings('knowledge');
        }
      }
    ]
  }
];
// First-run disclosure (R21 §4.3): two disclosures — cost and data path —
// and a visible "use my own key" branch. Copy comes from main (one source).
// Only "Continue" mints a key; Next/Skip never provision. The two choices are
// equal and each moves on, so the view has no Next.
function publikStep() {
  const c = state.publikState.copy.disclosure;
  // The terms sentence ends with its own link ("…agree to the publik API terms.").
  const link = '<a id="ob-publik-terms">publik API terms</a>';
  const terms = esc(c.terms).includes('publik API terms')
    ? esc(c.terms).replace('publik API terms', link)
    : `${esc(c.terms)} ${link}`;
  return {
    eyebrow: 'AI provider',
    title: c.title,
    lede: c.intro,
    body: () =>
      `<p class="ob-text"><strong>Cost.</strong> ${esc(c.cost)}</p>` +
      `<p class="ob-text"><strong>Where your prompts go.</strong> ${esc(c.dataPath)}</p>` +
      `<span class="ob-fine">${terms}</span>`,
    hideNext: true,
    buttons: [
      {
        label: c.accept,
        kind: 'secondary',
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
        kind: 'secondary',
        action: () => {
          if (obDialog) hideOnboardDialog();
          else finishOnboard();
          openSettings('keys');
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
      kind: 'primary',
      cta: true,
      action: async () => {
        onscreenly.publikOpen(card.primary.url);
        await done();
      }
    });
  }
  buttons.push({ label: card.secondary.label, kind: 'secondary', action: done });
  return {
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
  const last = obIndex === OB_STEPS.length - 1;
  const ob = $('#onboard');
  ob.classList.toggle('is-hero', !!step.hero);
  // The publik card has its own two buttons and no Next/Skip: leaving it any
  // other way would spend the starter without the card being acknowledged.
  ob.classList.toggle('card', !!step.publikCard);
  // The publik disclosure on its own (obDialog) is not a step, so it has no eyebrow.
  $('#ob-eyebrow').textContent = obDialog ? '' : step.eyebrow || '';
  $('#ob-title').textContent = step.title;
  $('#ob-lede').textContent = step.lede || '';
  const body = $('#ob-body');
  body.innerHTML = typeof step.body === 'function' ? step.body() : step.body || '';
  body.scrollTop = 0;
  const termsLink = $('#ob-publik-terms');
  if (termsLink) termsLink.addEventListener('click', () => onscreenly.publikOpen(state.publikState.links.terms));
  const btns = $('#ob-buttons');
  btns.innerHTML = '';
  (step.buttons || []).forEach((b) => {
    const el = document.createElement('button');
    el.type = 'button';
    setButtonKind(el, b.kind || 'secondary');
    if (b.cta) el.classList.add('ob-cta');
    el.textContent = b.label;
    el.addEventListener('click', b.action);
    btns.appendChild(el);
  });
  const next = $('#ob-next');
  next.textContent = last ? 'Get started' : 'Next';
  setButtonKind(next, step.bodyPrimary ? 'secondary' : 'primary');
  next.classList.toggle('hidden', !!step.hideNext);
  $('#ob-back').style.visibility = obIndex === 0 ? 'hidden' : 'visible';
  $('#ob-skip').style.visibility = last ? 'hidden' : 'visible';
  $('#ob-count').textContent = `Step ${obIndex + 1} of ${OB_STEPS.length}`;
  const dots = $('#ob-dots');
  dots.innerHTML = '';
  OB_STEPS.forEach((_, i) => {
    const d = document.createElement('span');
    if (i === obIndex) d.className = 'on';
    dots.appendChild(d);
  });
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
  // The permissions step's "Open settings" buttons open the system settings page they name.
  $('#ob-body').addEventListener('click', (e) => {
    const open = e.target.closest('[data-open-pane]');
    if (open) onscreenly.openPane(open.dataset.openPane);
  });
}

export { OB_STEPS, publikStep, setWindows10, showOnboard, showPublikCard, showPublikDisclosure };
