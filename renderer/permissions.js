// Permission gate window: shows microphone / screen permission state and
// links to the OS privacy settings. Loaded as a file so the page's CSP can
// forbid inline scripts.
(function () {
  const onscreenly = window.onscreenly;

  const statusMic = document.getElementById('status-mic');
  const statusScreen = document.getElementById('status-screen');
  const rowMic = document.getElementById('row-mic');
  const rowScreen = document.getElementById('row-screen');
  const badgeMic = document.getElementById('badge-mic');
  const badgeScreen = document.getElementById('badge-screen');
  const btnMic = document.getElementById('btn-mic');
  const btnScreen = document.getElementById('btn-screen');
  const checkBtn = document.getElementById('check-btn');
  const continueBtn = document.getElementById('continue-btn');
  const quitBtn = document.getElementById('quit-btn');

  function updateUI(status) {
    const micOk = status.mic === 'granted';
    const screenOk = status.screen === 'granted';

    // Mic
    rowMic.className = 'perm-row no-drag ' + (micOk ? 'granted' : 'denied');
    statusMic.textContent = micOk
      ? 'Granted'
      : status.mic === 'not-determined'
        ? 'Not yet requested'
        : 'Not granted — open Settings to allow';
    statusMic.className = 'perm-status ' + (micOk ? 'ok' : 'bad');
    badgeMic.textContent = micOk ? 'Allowed' : 'Not yet';
    badgeMic.className = 'perm-badge ' + (micOk ? 'ok' : 'bad');
    btnMic.classList.toggle('hidden', micOk);

    // Screen
    rowScreen.className = 'perm-row no-drag ' + (screenOk ? 'granted' : 'denied');
    statusScreen.textContent = screenOk
      ? 'Granted'
      : status.screen === 'not-determined'
        ? 'Not yet requested'
        : 'Not granted — open Settings to allow';
    statusScreen.className = 'perm-status ' + (screenOk ? 'ok' : 'bad');
    badgeScreen.textContent = screenOk ? 'Allowed' : 'Not yet';
    badgeScreen.className = 'perm-badge ' + (screenOk ? 'ok' : 'bad');
    btnScreen.classList.toggle('hidden', screenOk);

    // Continue
    continueBtn.disabled = !(micOk && screenOk);
  }

  async function checkPermissions() {
    checkBtn.classList.add('checking');
    checkBtn.textContent = 'Checking…';
    try {
      const status = await onscreenly.permissionsCheck();
      updateUI(status);
    } catch (e) {
      onscreenly.log('permissions check error: ' + e);
    } finally {
      checkBtn.classList.remove('checking');
      checkBtn.textContent = 'Check Again';
    }
  }

  // Open settings buttons — deep-link to the OS privacy pane. macOS uses the
  // x-apple.systempreferences: scheme; Windows has its own ms-settings: URIs
  // (opened the same way, via shell.openExternal in main). Windows has no
  // per-app "Screen Recording" privacy pane the way macOS does, so that
  // button lands on the general Privacy & security page instead.
  const isWin = onscreenly.platform === 'win32';
  btnMic.addEventListener('click', () => {
    onscreenly.openPane(
      isWin
        ? 'ms-settings:privacy-microphone'
        : 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone'
    );
  });
  btnScreen.addEventListener('click', () => {
    onscreenly.openPane(
      isWin ? 'ms-settings:privacy' : 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
    );
  });

  // Check again
  checkBtn.addEventListener('click', checkPermissions);

  // Continue — close permission window and launch the real app
  continueBtn.addEventListener('click', () => {
    onscreenly.permissionsContinue();
  });

  // Quit
  quitBtn.addEventListener('click', () => onscreenly.quit());

  // Initial check on page load
  checkPermissions();
})();
