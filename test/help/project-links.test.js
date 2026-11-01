const assert = require('node:assert/strict');
const test = require('node:test');
const { REPO, RELEASES_URL, problemReportUrl } = require('../../src/help/project-links');

test('Report a problem opens a new issue on the project with only the version and system filled in', () => {
  const url = new URL(
    problemReportUrl({ version: '0.2.5', platform: 'darwin', release: '15.1.0', arch: 'arm64', electron: '44.9.1' })
  );
  assert.equal(url.origin + url.pathname, `https://github.com/${REPO}/issues/new`);
  assert.deepEqual([...url.searchParams.keys()].sort(), ['body', 'labels']);
  const body = url.searchParams.get('body');
  assert.match(body, /Onscreenly 0\.2\.5 · macOS 15\.1\.0 \(arm64\) · Electron 44\.9\.1/);
  assert.match(body, /What happened\?/);
  // Nothing personal: no settings, keys, provider, paths or transcript.
  assert.doesNotMatch(body, /key|provider|vault|resume|résumé|transcript|\/Users\//i);
});

test('the releases link is the project’s latest release', () => {
  assert.equal(RELEASES_URL, `https://github.com/${REPO}/releases/latest`);
});
