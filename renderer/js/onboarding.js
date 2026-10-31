// First-run onboarding and the publik disclosure/card dialogs.
import { state } from './state.js';
import { $, isMac, isWindows, kbd, onscreenly, setButtonKind, shortcutKeys } from './core.js';
import { esc } from './chat.js';
import { rememberOpener, restoreFocus, safeFocus, topDialog } from './a11y.js';
import { onSettingsClosed, openSettings } from './settings-panel.js';
import { listenReadiness, providerLooksReady, providerName, sttName } from './settings-form.js';
import { renderPublikBlock, selectByoProvider } from './publik-settings.js';
import { setIgnore } from './window-behaviour.js';

// ---- onboarding / first-run tutorial -----------------------------------
// Each step fills the dialog's head (eyebrow, title, lede), its body, the body's buttons, and the
// footer: Skip, "Step n of 4" with decorative dots, Back and Next. One blue button per view: when
// the body has the primary action (bodyPrimary), Next is secondary.
const obScrim = $('#onboard-scrim');
const onboard = $('#onboard');
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

// What the permissions step knows: { mic, screen } from permissions:check, or null until it answers
// (Linux never asks; it has no such permissions).
let permissions = null;

async function checkPermissions() {
  if (isLinux) return;
  try {
    permissions = await onscreenly.permissionsCheck();
  } catch (_) {
    permissions = null;
  }
  if (onPermissionsStep()) renderOnboard();
}

const MAC_NOTE =
  'Meeting audio (the other side of a call) is off by default on macOS, because the system shows a recording indicator while it runs. Turn it on in Settings › Audio.';
const WINDOWS_10_NOTE = 'Screen capture needs no permission on Windows 10.';
const LINUX_NOTE =
  'Linux doesn’t ask for these permissions. If your desktop blocks screen capture, allow it in its privacy settings.';

// Each row is 'ok' (an "Allowed" tag), 'not' ("Not yet" and its "Open settings" button) or 'plain'
// (no state: Linux, or before the check answers). Once everything is allowed the step only confirms.
function permissionsView() {
  if (isLinux) return { allOk: false, rows: { mic: 'plain', screen: 'plain' }, note: LINUX_NOTE };
  const micOk = !!permissions && permissions.mic === 'granted';
  const screenOk = windows10 || (!!permissions && permissions.screen === 'granted');
  const view = (ok) => (!permissions ? 'plain' : ok ? 'ok' : 'not');
  return {
    allOk: micOk && screenOk,
    rows: { mic: view(micOk), screen: view(screenOk) },
    note: isMac ? MAC_NOTE : windows10 ? WINDOWS_10_NOTE : ''
  };
}

// A row in a Frost row group: a name, a line under it, and the row's state on the right. The
// button opens the system settings page it names (the label says which, for assistive tech).
function permissionRow(perm, name, sub, page, view) {
  const hide = (shown) => (shown ? '' : ' hidden');
  const pane = PERMISSION_PANES ? ` data-open-pane="${PERMISSION_PANES[perm]}"` : '';
  return (
    `<div class="ws-row ob-perm-row" data-perm="${perm}"><div class="ws-row-info">` +
    `<div class="ws-row-name">${name}</div><div class="ws-row-sub">${sub}</div></div>` +
    `<span class="tag is-ok ob-perm-ok${hide(view === 'ok')}"><span class="dot" aria-hidden="true"></span>Allowed</span>` +
    `<span class="tag ob-perm-not${hide(view === 'not')}">Not yet</span>` +
    `<button type="button" class="btn btn-secondary compact ob-perm-open${hide(view === 'not')}"${pane} aria-label="Open ${page} settings">Open settings</button>` +
    '</div>'
  );
}

function permissionsBody() {
  const { rows, note } = permissionsView();
  return (
    '<div class="ob-rows ws-rows">' +
    permissionRow('mic', 'Microphone', 'To hear you', 'Microphone', rows.mic) +
    (windows10
      ? ''
      : permissionRow('screen', 'Screen recording', 'To see your screen', 'Screen Recording', rows.screen)) +
    '</div>' +
    (note ? `<p class="ob-note">${note}</p>` : '')
  );
}

// A row for what answers or listening need, with a tag saying what is connected.
function needRow(need, name, sub, connected) {
  const tag = connected
    ? `<span class="tag is-ok" data-slot="${need}"><span class="dot" aria-hidden="true"></span>${esc(connected)}</span>`
    : `<span class="tag" data-slot="${need}">Not set</span>`;
  return (
    `<div class="ws-row ob-need-row" data-need="${need}"><div class="ws-row-info">` +
    `<div class="ws-row-name">${name}</div><div class="ws-row-sub">${sub}</div></div>${tag}</div>`
  );
}

function providerBody() {
  const listening = listenReadiness(state.settings, state.whisperOverview) !== 'none';
  return (
    '<div class="ob-rows ws-rows ob-needs">' +
    needRow(
      'answers',
      'Answers',
      'An API key for the provider you choose',
      providerLooksReady() && `Connected · ${providerName(state.settings.provider)}`
    ) +
    needRow(
      'listening',
      'Listening',
      'Speech-to-text: a Deepgram, OpenAI, Groq or Gemini key, or a free local model you download in Settings › Audio',
      listening && sttName(state.settings)
    ) +
    '</div>'
  );
}

// The global shortcuts, by action: their keys come from the user's settings (core.js).
const SHORTCUTS = [
  ['Start or end a session', 'listening'],
  ['What should I say?', 'say'],
  ['Assist', 'assist'],
  ['Solve the coding problem on screen', 'leetcode'],
  ['Add screen of a long problem, then solve', 'leetcodeAdd'],
  ['Hide or show', 'hide']
];

const OB_STEPS = [
  {
    eyebrow: 'Getting started',
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
    permissions: true,
    get title() {
      return permissionsView().allOk ? 'Microphone and screen recording are on' : 'Let Onscreenly see and hear';
    },
    get lede() {
      return permissionsView().allOk
        ? ''
        : 'Live answers need to hear the conversation and see your screen. Typing a question or preparing your résumé works without either, and you can allow them later.';
    },
    body: permissionsBody
  },
  {
    eyebrow: 'AI provider',
    title: 'Connect an AI provider',
    lede: 'Answers come from the provider you choose, with your own API key.',
    body: providerBody,
    // Until a provider is connected, opening Settings is the step's primary action. Either way
    // onboarding waits behind Settings and comes back at "You're all set".
    get bodyPrimary() {
      return !providerLooksReady();
    },
    get buttons() {
      return providerLooksReady()
        ? [{ label: 'Change provider', kind: 'secondary', action: () => suspendOnboard('keys') }]
        : [{ label: 'Open Settings', kind: 'primary', action: () => suspendOnboard('keys') }];
    }
  },
  {
    eyebrow: 'Shortcuts',
    title: 'You’re all set',
    lede: 'Reopen this guide from Help in the toolbar.',
    body: () =>
      '<div class="ob-rows ws-rows ob-keys">' +
      SHORTCUTS.map(
        ([label, keys]) =>
          `<div class="ws-row ob-key-row"><span class="ob-key-label">${label}</span><span class="ob-keycaps">${kbd(...shortcutKeys(keys))}</span></div>`
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
  const link = '<a id="ob-publik-terms" href="#">publik API terms</a>';
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
          if (obDialog) {
            hideOnboardDialog();
            openSettings('keys');
          } else {
            suspendOnboard('keys');
          }
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
  showOnboardScrim();
  safeFocus($('#ob-buttons .btn'));
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
    safeFocus($('#ob-buttons .btn'));
    return;
  }
  OB_STEPS.push(publikCardStep());
  obDialog = true;
  $('#onboard').classList.add('dialog');
  obIndex = OB_STEPS.length - 1;
  renderOnboard();
  showOnboardScrim();
  safeFocus($('#ob-buttons .btn'));
}
function hideOnboardDialog() {
  obDialog = false;
  $('#onboard').classList.remove('dialog');
  hideOnboardScrim();
}

let obIndex = 0;
function renderOnboard() {
  const step = OB_STEPS[obIndex];
  const last = obIndex === OB_STEPS.length - 1;
  const ob = $('#onboard');
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
  // href="#" puts the link in the Tab order; the click opens the terms in the browser instead.
  if (termsLink)
    termsLink.addEventListener('click', (e) => {
      e.preventDefault();
      onscreenly.publikOpen(state.publikState.links.terms);
    });
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
  // Back to step 1 (or on to the last step) hides the button that has focus: move focus to Next.
  const active = document.activeElement;
  if (active && (active.id === 'ob-back' || active.id === 'ob-skip') && active.style.visibility === 'hidden') {
    next.focus({ preventScroll: true });
  }
  $('#ob-count').textContent = `Step ${obIndex + 1} of ${OB_STEPS.length}`;
  const dots = $('#ob-dots');
  dots.innerHTML = '';
  OB_STEPS.forEach((_, i) => {
    const d = document.createElement('span');
    if (i === obIndex) d.className = 'on';
    dots.appendChild(d);
  });
}
// The scrim remembers what had focus before it showed and gives focus back once it hides.
function showOnboardScrim() {
  if (obScrim.classList.contains('hidden')) rememberOpener(onboard);
  obScrim.classList.remove('hidden');
  setIgnore(false);
}
function hideOnboardScrim() {
  obScrim.classList.add('hidden');
  restoreFocus(onboard);
}
function onPermissionsStep() {
  return !obScrim.classList.contains('hidden') && !obDialog && !!OB_STEPS[obIndex].permissions;
}

// Opening Settings from inside onboarding (step 3, or declining publik) suspends it: onboarding hides
// and comes back at "You're all set" once Settings closes after a successful save.
let obSuspended = false;
function suspendOnboard(tab) {
  obSuspended = true;
  obScrim.classList.add('hidden');
  openSettings(tab);
}
function resumeOnboard() {
  if (!obSuspended) return;
  obSuspended = false;
  obIndex = OB_STEPS.length - 1;
  renderOnboard();
  obScrim.classList.remove('hidden');
  setIgnore(false);
  safeFocus($('#ob-next'));
}

function showOnboard() {
  obDialog = false;
  obSuspended = false;
  $('#onboard').classList.remove('dialog');
  obIndex = 0;
  renderOnboard();
  showOnboardScrim();
  safeFocus($('#ob-next'));
  checkPermissions();
}

async function finishOnboard() {
  if (obDialog) {
    hideOnboardDialog();
    return;
  }
  hideOnboardScrim();
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
      if (onPermissionsStep()) checkPermissions();
    }
  });
  $('#ob-back').addEventListener('click', () => {
    if (obIndex > 0) {
      obIndex--;
      renderOnboard();
      if (onPermissionsStep()) checkPermissions();
    }
  });
  $('#ob-skip').addEventListener('click', finishOnboard);
  $('#logo-btn').addEventListener('click', showOnboard);
  // The permissions step's "Open settings" buttons open the system settings page they name. Coming
  // back to the window checks again, so a permission switched on there shows as allowed here.
  $('#ob-body').addEventListener('click', (e) => {
    const open = e.target.closest('[data-open-pane]');
    if (open) onscreenly.openPane(open.dataset.openPane);
  });
  window.addEventListener('focus', () => {
    if (onPermissionsStep()) checkPermissions();
  });
  onSettingsClosed(resumeOnboard);
  // Escape skips onboarding, one layer per press: it runs in the capture phase and stops there, so
  // Settings underneath stays open, and it waits while consent is on top. The publik card has no
  // way out but its two buttons, so it ignores Escape.
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented || topDialog() !== onboard) return;
      e.preventDefault();
      e.stopPropagation();
      if (!OB_STEPS[obIndex].publikCard) finishOnboard();
    },
    true
  );
}

export { OB_STEPS, publikStep, setWindows10, showOnboard, showPublikCard, showPublikDisclosure };
