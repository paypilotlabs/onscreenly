// @ts-check
// A coding problem longer than the screen, captured one part at a time: "Add screen" keeps the part
// that is visible, the user scrolls, adds the next, and the solve sends every part (oldest first)
// with a screenshot of what is visible then. Held in memory only, never saved.
//
// The parts are one problem, so they expire together: MAX_AGE_MS after the last add or solve, all
// of them go (never the top of a problem alone). A solve lets go of exactly the parts it sent, and
// only when it was a whole answer; a part added while it was answering stays for the next solve.

const MAX_SCREENS = 4;
const MAX_AGE_MS = 10 * 60 * 1000;

/**
 * @param {{ now?: () => number, max?: number, maxAgeMs?: number }} [options]
 */
function createProblemScreens({ now = Date.now, max = MAX_SCREENS, maxAgeMs = MAX_AGE_MS } = {}) {
  /** @type {string[]} */
  let shots = [];
  let lastAt = 0;
  const fresh = () => {
    if (shots.length && now() - lastAt > maxAgeMs) shots = [];
    return shots;
  };
  return {
    max,
    /** Keeps one part. Refused once `max` parts are held. */
    add(/** @type {string} */ dataUrl) {
      if (typeof dataUrl !== 'string' || !dataUrl) return { ok: false, count: fresh().length };
      if (fresh().length >= max) return { ok: false, count: shots.length, full: true };
      shots.push(dataUrl);
      lastAt = now();
      return { ok: true, count: shots.length };
    },
    count() {
      return fresh().length;
    },
    /** The parts held now, oldest first. Listing does not use them up. */
    list() {
      return fresh().slice();
    },
    /** Keeps the parts for another MAX_AGE_MS (a solve that said part of the problem is missing). */
    touch() {
      if (fresh().length) lastAt = now();
    },
    /** Lets go of the first `n` parts: the ones a finished solve sent. Later parts stay. */
    release(/** @type {number} */ n) {
      shots = fresh().slice(Math.max(0, n));
    },
    clear() {
      shots = [];
    }
  };
}

module.exports = { createProblemScreens, MAX_SCREENS, MAX_AGE_MS };
