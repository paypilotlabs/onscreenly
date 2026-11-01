// @ts-check
// The project's public GitHub pages that Help opens: a new issue, pre-filled with what helps triage
// and nothing personal, and the latest release. Built here from fixed parts, never from a URL the
// window sends, so the renderer cannot hand the OS a link of its choosing.

const REPO = 'paypilotlabs/onscreenly';
const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;
const LATEST_RELEASE_API = `https://api.github.com/repos/${REPO}/releases/latest`;

/**
 * A "new issue" link with the app version and system filled in. No settings, keys, provider,
 * transcript or file names: the user writes the rest in their browser and sees all of it first.
 * @param {{ version: string, platform: string, release: string, arch: string, electron: string }} about
 */
function problemReportUrl(about) {
  const os = { darwin: 'macOS', win32: 'Windows', linux: 'Linux' }[about.platform] || about.platform;
  const body = [
    '**What happened?**',
    '',
    '',
    '**What did you expect?**',
    '',
    '',
    '**Steps to see it again**',
    '1. ',
    '',
    '---',
    `Onscreenly ${about.version} · ${os} ${about.release} (${about.arch}) · Electron ${about.electron}`
  ].join('\n');
  const params = new URLSearchParams({ body, labels: 'bug' });
  return `https://github.com/${REPO}/issues/new?${params}`;
}

module.exports = { REPO, RELEASES_URL, LATEST_RELEASE_API, problemReportUrl };
