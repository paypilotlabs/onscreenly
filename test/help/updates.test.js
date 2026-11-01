const assert = require('node:assert/strict');
const test = require('node:test');
const { isNewer, parseVersion, checkForUpdate } = require('../../src/help/updates');

test('versions compare by number, and anything that is not a plain release is never newer', () => {
  assert.deepEqual(parseVersion('v0.2.10'), [0, 2, 10]);
  assert.equal(isNewer('v0.2.10', '0.2.9'), true);
  assert.equal(isNewer('v0.3.0', '0.2.9'), true);
  assert.equal(isNewer('v1.0.0', '0.9.9'), true);
  assert.equal(isNewer('v0.2.5', '0.2.5'), false);
  assert.equal(isNewer('v0.2.4', '0.2.5'), false);
  assert.equal(isNewer('v0.3.0-beta.1', '0.2.5'), false);
  assert.equal(isNewer('nightly', '0.2.5'), false);
});

const reply =
  (body, ok = true) =>
  async () => ({ ok, json: async () => body });

test('a newer published release is reported; the same, older, draft or prerelease one is not', async () => {
  const check = (fetchImpl) => checkForUpdate({ current: '0.2.5', url: 'https://example.test/latest', fetchImpl });
  assert.deepEqual(await check(reply({ tag_name: 'v0.2.6' })), { version: '0.2.6' });
  assert.equal(await check(reply({ tag_name: 'v0.2.5' })), null);
  assert.equal(await check(reply({ tag_name: 'v0.2.4' })), null);
  assert.equal(await check(reply({ tag_name: 'v0.3.0', draft: true })), null);
  assert.equal(await check(reply({ tag_name: 'v0.3.0', prerelease: true })), null);
});

test('any failure is silent: no network, an error page, or a body that is not a release', async () => {
  const check = (fetchImpl) => checkForUpdate({ current: '0.2.5', url: 'https://example.test/latest', fetchImpl });
  assert.equal(
    await check(async () => {
      throw new Error('offline');
    }),
    null
  );
  assert.equal(await check(reply({ message: 'rate limited' }, false)), null);
  assert.equal(await check(reply(null)), null);
  assert.equal(
    await check(async () => ({
      ok: true,
      json: async () => {
        throw new SyntaxError('not json');
      }
    })),
    null
  );
});

test('the request names the app and asks for the GitHub API format, with a time limit', async () => {
  let seen;
  await checkForUpdate({
    current: '0.2.5',
    url: 'https://example.test/latest',
    fetchImpl: async (url, init) => {
      seen = { url, init };
      return { ok: true, json: async () => ({ tag_name: 'v0.2.5' }) };
    }
  });
  assert.equal(seen.url, 'https://example.test/latest');
  assert.equal(seen.init.headers['User-Agent'], 'Onscreenly');
  assert.ok(seen.init.signal instanceof AbortSignal);
});
