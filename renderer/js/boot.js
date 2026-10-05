// Boot: load settings and state from main, then paint the UI.
import { state } from './state.js';
import { $, isWindows, onscreenly, setSessionButton } from './core.js';
import { placeholder, smartBtn, syncPlaceholder, updateSendButtonState } from './composer.js';
import { applyOpacity } from './toolbar.js';
import { updateSmartTooltip } from './settings-panel.js';
import { showExample } from './settings-save.js';
import { OB_STEPS, publikStep, showOnboard } from './onboarding.js';

export function init() {
  // ---- boot --------------------------------------------------------------
  (async function boot() {
    state.settings = await onscreenly.settingsGet();
    const platformInfo = await onscreenly.platformInfo();
    state.publikState = await onscreenly.publikState();
    // A build with no app token never shows the option, and keeps the BYO
    // onboarding card. With one, the "Connect an AI provider" card becomes the
    // publik disclosure; the BYO branch stays one tap away on that card.
    if (state.publikState.available) OB_STEPS.splice(2, 1, { ...publikStep(), publik: true });

    // R4: shortcut hints
    const sayHintEl = document.getElementById('say-shortcut-hint');
    const assistHintEl = document.getElementById('assist-shortcut-hint');
    if (sayHintEl) sayHintEl.textContent = isWindows ? 'Ctrl+↵' : '⌘↵';
    if (assistHintEl) assistHintEl.textContent = isWindows ? 'Ctrl+Shift+↵' : '⌘⇧↵';
    const sayBtn = document.querySelector('.act[data-mode="say"]');
    const assistBtn = document.querySelector('.act[data-mode="assist"]');
    if (sayBtn)
      sayBtn.title = isWindows
        ? 'Suggests what to say next based on the conversation (Ctrl+Enter)'
        : 'Suggests what to say next based on the conversation (⌘↵)';
    if (assistBtn)
      assistBtn.title = isWindows
        ? 'Scans your screen and conversation to decide what you need (Ctrl+Shift+Enter)'
        : 'Scans your screen and conversation to decide what you need (⌘⇧↵)';

    // R6: smart tooltip
    updateSmartTooltip();
    // Fix 3: Adjust permission buttons based on actual Windows version.
    // ms-settings:privacy-screenrecorder only exists on Windows 11.
    // On Windows 10, screen capture needs no permission — so replace the button
    // with a more helpful note instead of an invalid settings link.
    if (isWindows && platformInfo.winBuild > 0 && platformInfo.winBuild < 22000) {
      // Windows 10: update the onboarding screen recording button to be more helpful
      const ob = OB_STEPS[1];
      ob.buttons = ob.buttons.filter((b) => !b.label.toLowerCase().includes('screen'));
      ob.body =
        'Onscreenly needs microphone permission to hear you. Click the button below to open Windows microphone settings and allow onscreenly.<br><br><strong>Screen capture works automatically on Windows 10</strong> — no additional permission needed.<ul><li><strong>Microphone</strong> — to hear you</li><li><strong>Screen recording</strong> — works automatically on Windows 10</li></ul>';
    }

    smartBtn.classList.toggle('on', !!state.settings.smart);
    showExample();
    syncPlaceholder();
    updateSendButtonState(); // Initialize send button state

    // Fix placeholder shortcut hint to match platform
    if (isWindows) {
      placeholder.innerHTML =
        'Ask about your screen or conversation, or <span class="keycap">Ctrl</span><span class="keycap">⇧</span><span class="keycap">⏎</span> for Smart assist';
    }

    applyOpacity(state.settings.opacity, false);

    const st = await onscreenly.captureState();
    $('#live-dot').classList.toggle('off', !st.active);
    setSessionButton(st.active);
    if (!state.settings.onboarded) showOnboard();
  })();
}
