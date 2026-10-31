// What launch does about missing OS permissions, per platform (app/main/permissions.js). Cross-window
// stacking cannot be asserted from a test, so the branch that decides which window shows is pure and
// checked here for every platform, first run or not, and permissions granted or not.
const assert = require('node:assert/strict');
const test = require('node:test');

const { permissionGatePlan } = require('../../app/main/permissions');

const plan = (platform, onboarded, allGranted) => permissionGatePlan({ platform, onboarded, allGranted });

test('macOS never holds the app behind the permissions window: text-only use needs no permission', () => {
  for (const onboarded of [false, true]) {
    for (const allGranted of [false, true]) assert.equal(plan('darwin', onboarded, allGranted), 'none');
  }
});

test('Windows never shows two windows on first run, and puts the window beside the overlay later', () => {
  // First run: onboarding's permissions step asks instead.
  assert.equal(plan('win32', false, false), 'none');
  assert.equal(plan('win32', false, true), 'none');
  // A returning user whose microphone is off: the overlay starts and the window shows above it.
  assert.equal(plan('win32', true, false), 'beside');
  assert.equal(plan('win32', true, true), 'none');
});

test('Linux asks for nothing, so it never shows the window', () => {
  for (const onboarded of [false, true]) {
    for (const allGranted of [false, true]) assert.equal(plan('linux', onboarded, allGranted), 'none');
  }
});
