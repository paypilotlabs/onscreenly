const assert = require('node:assert/strict');
const test = require('node:test');

const builder = require('../../electron-builder.cjs');
const pkg = require('../../package.json');

test('defines explicit Windows x64 package targets: an installer and a portable exe with distinct names', () => {
  assert.equal(pkg.scripts['pack:win'], 'electron-builder --win --dir');
  assert.equal(pkg.scripts['dist:win'], 'electron-builder --win');
  assert.deepEqual(builder.win.target, [
    { target: 'nsis', arch: ['x64'] },
    { target: 'portable', arch: ['x64'] }
  ]);
  // Both are .exe files: without their own names the second overwrites the first.
  assert.notEqual(builder.nsis.artifactName, builder.portable.artifactName);
  assert.match(builder.nsis.artifactName, /setup/);
  assert.match(builder.portable.artifactName, /portable/);
});

test('ships every runtime directory in packaged builds', () => {
  assert.ok(builder.files.includes('app/**/*'));
  assert.ok(builder.files.includes('preload.js'));
  assert.ok(builder.files.includes('src/**/*'));
  assert.ok(builder.files.includes('renderer/**/*'));
});
