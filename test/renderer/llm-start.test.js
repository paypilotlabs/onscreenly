const test = require('node:test');
const assert = require('node:assert/strict');
const { rendererModule } = require('../helpers/renderer-source');

const source = rendererModule('events.js');

test('starting a new answer keeps the earlier conversation on screen', () => {
  const start = source.indexOf("onscreenly.on('llm:start'");
  const end = source.indexOf("onscreenly.on('llm:token'");
  assert.ok(start !== -1 && end > start, 'llm:start and llm:token handlers exist in order');
  assert.doesNotMatch(source.slice(start, end), /clearMessages\(\)/);
});
