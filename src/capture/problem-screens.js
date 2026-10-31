// @ts-check
// A coding problem longer than the screen, captured one part at a time: "Add screen" keeps the part
// that is visible, the user scrolls, adds the next, and the solve sends every part (oldest first)
// with a screenshot of what is visible then. Held in memory only, never saved; parts older than
// MAX_AGE_MS are dropped, so an old problem never leaks into a new solve.

const MAX_SCREENS = 4;
const MAX_AGE_MS = 10 * 60 * 1000;

/**
 * @param {{ now?: () => number, max?: number, maxAgeMs?: number }} [options]
 */
function createProblemScreens({ now = Date.now, max = MAX_SCREENS, maxAgeMs = MAX_AGE_MS } = {}) {
  /** @type {{ dataUrl: string, at: number }[]} */
  let shots = [];
  const fresh = () => {
    const t = now();
    shots = shots.filter((s) => t - s.at <= maxAgeMs);
    return shots;
  };
  return {
    max,
    /** Keeps one part. Refused once `max` parts are held. */
    add(/** @type {string} */ dataUrl) {
      if (typeof dataUrl !== 'string' || !dataUrl) return { ok: false, count: fresh().length };
      if (fresh().length >= max) return { ok: false, count: shots.length, full: true };
      shots.push({ dataUrl, at: now() });
      return { ok: true, count: shots.length };
    },
    count() {
      return fresh().length;
    },
    /** The parts held now, oldest first. They stay until clear(), so a failed solve can be retried. */
    list() {
      return fresh().map((s) => s.dataUrl);
    },
    clear() {
      shots = [];
    }
  };
}

module.exports = { createProblemScreens, MAX_SCREENS, MAX_AGE_MS };
