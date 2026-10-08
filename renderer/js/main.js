// Renderer entry. Each module declares its functions and DOM handles when it
// loads; init() then wires listeners and runs startup work in the same order
// as the original single-file renderer.
import { init as initCore } from './core.js';
import { init as initChat } from './chat.js';
import { init as initComposer } from './composer.js';
import { init as initToolbar } from './toolbar.js';
import { init as initTranscript } from './transcript.js';
import { init as initEvents } from './events.js';
import { init as initSettingsPanel } from './settings-panel.js';
import { init as initPublikSettings } from './publik-settings.js';
import { init as initSettingsForm } from './settings-form.js';
import { init as initProfileSettings } from './profile-settings.js';
import { init as initKnowledgeSettings } from './knowledge-settings.js';
import { init as initWhisperSettings } from './whisper-settings.js';
import { init as initWindowBehaviour } from './window-behaviour.js';
import { init as initA11y } from './a11y.js';
import { init as initConsent } from './consent.js';
import { init as initOnboarding } from './onboarding.js';
import { init as initBoot } from './boot.js';

initCore();
initChat();
initComposer();
initToolbar();
initTranscript();
initEvents();
initSettingsPanel();
initPublikSettings();
initSettingsForm();
initProfileSettings();
initKnowledgeSettings();
initWhisperSettings();
initWindowBehaviour();
initA11y();
initConsent();
initOnboarding();
initBoot();
