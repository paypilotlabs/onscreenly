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

test('parts older than the age limit are dropped, so an old problem never joins a new solve', () => {
  let now = 1000;
  const screens = createProblemScreens({ now: () => now });
  screens.add('data:image/png;base64,old');
  now += MAX_AGE_MS - 1;
  screens.add('data:image/png;base64,new');
  now += 2;
  assert.deepEqual(screens.list(), ['data:image/png;base64,new']);
});

test('an empty capture is not kept', () => {
  const screens = createProblemScreens();
  assert.equal(screens.add('').ok, false);
  assert.equal(screens.add(null).ok, false);
  assert.equal(screens.count(), 0);
});
