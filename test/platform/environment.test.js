const test = require('node:test');
const assert = require('node:assert/strict');
const { readEnvironment } = require('../../src/platform/environment');

for (const name of ['NO_PROTECT', 'BUNDLE_WHISPER', 'WHISPER_RUNTIME']) {
  test(`${name} accepts legacy configuration and gives canonical settings precedence`, () => {
    const legacy = 'CUE_' + name;
    const canonical = 'ONSCREENLY_' + name;
    assert.equal(readEnvironment(name, {}), undefined);
    assert.equal(readEnvironment(name, { [legacy]: 'legacy' }), 'legacy');
    for (const value of ['new', '', '0']) {
      assert.equal(readEnvironment(name, { [legacy]: 'legacy', [canonical]: value }), value);
    }
  });
}
