const assert = require('node:assert/strict');
const test = require('node:test');
const { createProblemScreens, MAX_SCREENS, MAX_AGE_MS } = require('../../src/capture/problem-screens');

test('keeps the parts of a long problem in order, up to the limit', () => {
  const screens = createProblemScreens();
  for (let i = 1; i <= MAX_SCREENS; i++)
    assert.deepEqual(screens.add(`data:image/png;base64,${i}`), { ok: true, count: i });
  assert.deepEqual(screens.add('data:image/png;base64,extra'), { ok: false, count: MAX_SCREENS, full: true });
  assert.deepEqual(
    screens.list(),
    Array.from({ length: MAX_SCREENS }, (_, i) => `data:image/png;base64,${i + 1}`)
  );
  assert.equal(screens.list().length, MAX_SCREENS, 'listing does not use them up');
  screens.clear();
  assert.equal(screens.count(), 0);
});

test('the parts expire together, never the top of a problem alone', () => {
  let now = 1000;
  const screens = createProblemScreens({ now: () => now });
  screens.add('data:image/png;base64,top');
  now += MAX_AGE_MS - 1;
  screens.add('data:image/png;base64,bottom');
  now += 2;
  assert.deepEqual(screens.list(), ['data:image/png;base64,top', 'data:image/png;base64,bottom']);
  now += MAX_AGE_MS + 1;
  assert.deepEqual(screens.list(), []);
});

test('touch keeps the parts fresh; release lets go of only the parts a solve sent', () => {
  let now = 0;
  const screens = createProblemScreens({ now: () => now });
  screens.add('a');
  now += MAX_AGE_MS - 1;
  screens.touch();
  now += MAX_AGE_MS - 1;
  assert.deepEqual(screens.list(), ['a']);
  screens.add('b'); // added while the solve that sent 'a' was answering
  screens.release(1);
  assert.deepEqual(screens.list(), ['b']);
});

test('an empty capture is not kept', () => {
  const screens = createProblemScreens();
  assert.equal(screens.add('').ok, false);
  assert.equal(screens.add(null).ok, false);
  assert.equal(screens.count(), 0);
});
