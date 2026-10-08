// Boot: load settings and state from main, then paint the UI.
import { state } from './state.js';
import { isWindows, onscreenly, setSessionButton } from './core.js';
import { smartBtn, syncPlaceholder, updateSendButtonState } from './composer.js';
import { applyOpacity } from './toolbar.js';
import { setLiveDotState } from './transcript.js';
import { updateSmartTooltip } from './settings-panel.js';
import { paintReadiness } from './settings-form.js';
import { OB_STEPS, publikStep, setWindows10, showOnboard } from './onboarding.js';

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
    // ms-settings:privacy-screenrecorder only exists on Windows 11. On Windows 10
    // screen capture needs no permission, so onboarding asks for the microphone only.
    setWindows10(isWindows && platformInfo.winBuild > 0 && platformInfo.winBuild < 22000);

    smartBtn.classList.toggle('on', !!state.settings.smart);
    smartBtn.setAttribute('aria-pressed', String(!!state.settings.smart));
    syncPlaceholder();
    updateSendButtonState(); // Initialize send button state

    applyOpacity(state.settings.opacity, false);

    // The empty state follows the setup. Whether a local model is downloaded is checked next; until
    // then (or if it can't be read) it counts as ready, so nothing warns about what wasn't checked.
    paintReadiness();
    state.whisperOverview = await onscreenly.whisperModels().catch(() => null);
    paintReadiness();

    const st = await onscreenly.captureState();
    setLiveDotState(st.active ? 'idle' : 'off');
    setSessionButton(st.active);
    if (!state.settings.onboarded) showOnboard();
  })();
}
