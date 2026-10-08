// Boot: load settings and state from main, then paint the UI.
import { state } from './state.js';
import { isWindows, onscreenly, setSessionButton } from './core.js';
import { smartBtn, syncPlaceholder, updateSendButtonState } from './composer.js';
import { applyOpacity } from './toolbar.js';
import { setLiveDotState } from './transcript.js';
import { updateSmartTooltip } from './settings-panel.js';
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
    smartBtn.setAttribute('aria-pressed', String(!!state.settings.smart));
    syncPlaceholder();
    updateSendButtonState(); // Initialize send button state

    applyOpacity(state.settings.opacity, false);

    const st = await onscreenly.captureState();
    setLiveDotState(st.active ? 'idle' : 'off');
    setSessionButton(st.active);
    if (!state.settings.onboarded) showOnboard();
  })();
}
