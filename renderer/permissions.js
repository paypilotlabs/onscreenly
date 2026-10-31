// Permission window: shows the microphone and screen permission state, links
// to the OS privacy settings, and lets the user check again or continue.
// Loaded as a file so the page's CSP can forbid inline scripts.
//
// macOS opens it on first run while a permission is missing; the overlay
// starts once both are allowed. Windows opens it only for a returning user
// whose microphone is off, beside the running overlay, so it asks for the
// microphone alone and Continue always works ("Continue without microphone"
// until it is on). Linux never opens it.
(function () {
  const onscreenly = window.onscreenly;
  const isWindows = onscreenly.platform === 'win32';

  const $ = (id) => document.getElementById(id);
  const checkBtn = $('check-btn');
  const continueBtn = $('continue-btn');

  const STATUS = { granted: 'Allowed', 'not-determined': 'Not requested yet' };

  // The pages behind each row's "Open settings" button. Windows shows no screen row:
  // screen capture needs no permission there.
  const PANES = isWindows
    ? { mic: 'ms-settings:privacy-microphone' }
    : {
        mic: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
        screen: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
      };

  // One blue button per view: Continue is primary unless it is the way past a missing microphone.
  function setKind(button, kind) {
    button.classList.remove('btn-primary', 'btn-secondary');
    button.classList.add(`btn-${kind}`);
  }

  function paintCopy() {
    $('perm-eyebrow').textContent = isWindows ? 'Before you start' : 'Welcome to Onscreenly';
    $('perm-title').textContent = isWindows ? 'Allow microphone access' : 'Allow microphone and screen recording';
    $('perm-desc').textContent = isWindows
      ? 'Onscreenly needs your microphone to hear the conversation. Screen capture needs no permission on Windows.'
      : 'Onscreenly needs to hear the conversation and see your screen to answer.';
    $('perm-note-text').textContent = isWindows
      ? 'After you switch the microphone on, click Check again.'
      : 'After you switch a permission on, click Check again. macOS may need Onscreenly to restart before screen recording works.';
    $('row-screen').classList.toggle('hidden', isWindows);
  }

  // Each row shows an "Allowed" tag, or its "Open settings" button while the permission is missing.
  function updateUI(status) {
    const micOk = status.mic === 'granted';
    const screenOk = isWindows || status.screen === 'granted';
    for (const [key, ok] of [
      ['mic', micOk],
      ['screen', screenOk]
    ]) {
      $(`status-${key}`).textContent = STATUS[status[key]] || 'Not allowed yet';
      $(`badge-${key}`).classList.toggle('hidden', !ok);
      $(`btn-${key}`).classList.toggle('hidden', ok);
    }
    if (isWindows) {
      continueBtn.disabled = false;
      continueBtn.textContent = micOk ? 'Continue' : 'Continue without microphone';
      setKind(continueBtn, micOk ? 'primary' : 'secondary');
    } else {
      continueBtn.disabled = !(micOk && screenOk);
    }
  }

  async function checkPermissions() {
    checkBtn.disabled = true;
    checkBtn.setAttribute('aria-busy', 'true');
    checkBtn.textContent = 'Checking…';
    try {
      updateUI(await onscreenly.permissionsCheck());
    } catch (e) {
      onscreenly.log('permissions check error: ' + e);
      // Never leave "Checking…" up for good: say the check failed, and how to retry.
      for (const id of ['status-mic', 'status-screen']) $(id).textContent = 'Couldn’t check. Try Check again.';
    } finally {
      checkBtn.disabled = false;
      checkBtn.removeAttribute('aria-busy');
      checkBtn.textContent = 'Check again';
    }
  }

  $('btn-mic').addEventListener('click', () => onscreenly.openPane(PANES.mic));
  $('btn-screen').addEventListener('click', () => onscreenly.openPane(PANES.screen));
  checkBtn.addEventListener('click', checkPermissions);
  // Continue: close this window and start (or bring forward) the overlay.
  continueBtn.addEventListener('click', () => onscreenly.permissionsContinue());
  $('quit-btn').addEventListener('click', () => onscreenly.quit());

  paintCopy();
  checkPermissions();
  // Back from System Settings: look again, so a permission just allowed shows at once.
  window.addEventListener('focus', () => {
    if (!checkBtn.disabled) checkPermissions();
  });
})();
