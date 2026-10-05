const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', '..', 'renderer', 'renderer.js'), 'utf8');

test('starting a new answer keeps the earlier conversation on screen', () => {
  const start = source.indexOf("onscreenly.on('llm:start'");
  const end = source.indexOf("onscreenly.on('llm:token'");
  assert.ok(start !== -1 && end > start, 'llm:start and llm:token handlers exist in order');
  assert.doesNotMatch(source.slice(start, end), /clearMessages\(\)/);
});
