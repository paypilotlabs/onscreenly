// @ts-check
// Meeting history + memory — local JSON-file persistence.
// Each meeting: { id, title, startedAt, endedAt, channels, transcript,
//   summary, actionItems, followUp, notes, context }
// Lightweight retrieval: returns only the last N summaries for memory injection,
// never the full transcript of every meeting.
//
// The file holds full transcripts, so it gets the same treatment as the
// settings file (settings-store-core.js): atomic temp → backup → rename writes,
// owner-only permissions, and failures reported rather than swallowed. A
// damaged file is set aside (meetings.json.corrupt-<time>) and history is
// recovered from the backup; a file too large to load is left untouched and
// nothing is written over it until the user archives it.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createFileStore } = require('../storage/settings-store-core');

// Over this, meetings.json is not loaded (or written) until the user archives it.
// 100 meetings at the 200k-character transcript cap (meeting-memory.js) stay well under it.
const MAX_LOAD_BYTES = 48 * 1024 * 1024;

/**
 * A record from disk in the shape the rest of the app reads. A hand-edited or
 * damaged entry can lack the arrays every reader indexes into; filling them in
 * keeps one bad record from stopping the app at launch.
 * @param {any} m
 */
function normalizeMeeting(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m) || typeof m.id !== 'string' || !m.id) return null;
  const out = { ...m };
  out.transcript = Array.isArray(m.transcript)
    ? m.transcript.filter((t) => t && typeof t === 'object' && typeof t.text === 'string')
    : [];
  for (const key of ['actionItems', 'keyPoints', 'decisions']) if (!Array.isArray(m[key])) out[key] = [];
  if (typeof out.startedAt !== 'number') out.startedAt = 0;
  return out;
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

/**
 * @param {{ file?: string, debounceMs?: number, maxLoadBytes?: number, onError?: (e: Error) => void }} [opts]
 */
function createMeetingStore(opts = {}) {
  const file = opts.file;
  const onError = opts.onError || (() => {});
  const core = file
    ? createFileStore(() => path.dirname(file), path.basename(file), {
        maxBytes: opts.maxLoadBytes || MAX_LOAD_BYTES,
        validate: Array.isArray,
        compact: true
      })
    : null;

  /** @type {{ state: 'ok' | 'recovered' | 'corrupt' | 'too-large', aside?: string | null, size?: number, dropped?: number }} */
  let status = { state: 'ok' };
  let meetings = [];
  let writable = !!core;

  function load() {
    if (!core) return;
    const loaded = core.load();
    if (!loaded) return;
    if (loaded.tooLarge) {
      status = { state: 'too-large', size: loaded.size };
      writable = false; // never write a small history over a large one
      return;
    }
    if (loaded.mainCorrupt) {
      const aside = core.quarantineMain();
      status = { state: loaded.recoveredFromBackup ? 'recovered' : 'corrupt', aside };
    }
    const raw = Array.isArray(loaded.data) ? loaded.data : [];
    meetings = raw.map(normalizeMeeting).filter(Boolean);
    const dropped = raw.length - meetings.length;
    if (dropped && status.state === 'ok') {
      // Keep what could not be read before the next save leaves it out.
      const aside = `${core.mainPath()}.corrupt-${stamp()}`;
      try {
        fs.copyFileSync(core.mainPath(), aside);
      } catch (_) {}
      status = { state: 'recovered', aside, dropped };
    }
  }
  load();

  // addTurn fires every few seconds during a meeting; with `debounceMs` set the
  // writes are coalesced and done off the main thread so the whole file isn't
  // rewritten per turn. Callers that need the bytes on disk now (quit) call flush().
  const debounceMs = opts.debounceMs || 0;
  let saveTimer = null;
  let closed = false;
  let generation = 0; // bumped by close/clear so a write already under way is not trusted
  let writing = Promise.resolve();
  /** @type {Error | null} */
  let lastError = null;

  function failed(e) {
    const first = !lastError;
    lastError = e;
    console.error('[meetings] could not save meeting history:', e && e.message);
    if (first) onError(e); // once per failure streak
  }
  function succeeded() {
    lastError = null;
  }

  function saveNow() {
    if (!writable || closed) return;
    try {
      core.persist(meetings);
      succeeded();
    } catch (e) {
      failed(e);
    }
  }

  function save() {
    if (!writable || closed) return;
    if (!debounceMs) {
      saveNow();
      return;
    }
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      const gen = generation;
      const snapshot = meetings;
      writing = writing
        .then(() => (gen === generation && !closed ? core.persistAsync(snapshot) : undefined))
        .then(succeeded, failed);
    }, debounceMs);
  }

  function cancelPending() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
  }

  return {
    file,
    list() {
      return meetings;
    },

    /** How loading went: 'ok', 'recovered' (from backup or by skipping unreadable records), 'corrupt' or 'too-large'. */
    status() {
      return status;
    },

    /** Null when the last save worked; otherwise its Error. */
    lastError() {
      return lastError;
    },

    info() {
      let bytes = 0;
      try {
        if (file) bytes = fs.statSync(file).size;
      } catch (_) {}
      return { count: meetings.length, bytes, state: status.state, writable };
    },

    // Writes synchronously (quit). Returns whether the history is on disk.
    flush() {
      cancelPending();
      if (!file || !writable || closed) return { ok: !lastError, error: lastError };
      saveNow();
      return { ok: !lastError, error: lastError };
    },

    /** Resolves once a debounced write that is already under way has finished. */
    settle() {
      return writing.catch(() => {});
    },

    // Stops all writes for good: after this, nothing this store holds can reach the disk again.
    close() {
      closed = true;
      generation++;
      cancelPending();
    },

    // Removes every meeting and every copy of the history on disk: the file, its temp file and
    // backup, and set-aside or archived copies.
    clearAll() {
      cancelPending();
      generation++;
      meetings = [];
      if (!file) return;
      const dir = path.dirname(file);
      const base = path.basename(file);
      const stem = base.replace(/\.json$/, '');
      for (const name of fs.readdirSync(dir)) {
        if (
          name === base ||
          name === `${base}.tmp` ||
          name === `${base}.bak` ||
          name.startsWith(`${base}.corrupt-`) ||
          (name.startsWith(`${stem}-archive-`) && name.endsWith('.json'))
        ) {
          fs.rmSync(path.join(dir, name), { force: true });
        }
      }
      status = { state: 'ok' };
      writable = !closed;
      lastError = null;
    },

    // A history over the load limit is renamed (kept, not deleted) so recording can start fresh.
    archiveOversized() {
      if (!file || status.state !== 'too-large') return null;
      const target = path.join(path.dirname(file), `${path.basename(file, '.json')}-archive-${stamp()}.json`);
      fs.renameSync(file, target);
      status = { state: 'ok' };
      writable = !closed;
      save();
      return target;
    },

    // Keep the newest `max` meetings; returns how many were dropped.
    prune(max) {
      if (!(max > 0) || meetings.length <= max) return 0;
      const dropped = meetings.length - max;
      meetings = meetings.slice(-max);
      save();
      return dropped;
    },

    add() {
      const m = {
        id: newId(),
        title: 'Untitled meeting',
        startedAt: Date.now(),
        endedAt: null,
        transcript: [], // { channel, text, ts }
        summary: '',
        keyPoints: [],
        decisions: [],
        actionItems: [],
        followUp: '',
        context: ''
      };
      meetings.push(m);
      save();
      return m;
    },

    get(id) {
      return meetings.find((m) => m.id === id) || null;
    },

    update(id, patch) {
      const m = this.get(id);
      if (!m) return null;
      Object.assign(m, patch);
      save();
      return m;
    },

    addTurn(id, turn) {
      const m = this.get(id);
      if (!m) return null;
      m.transcript.push(turn);
      save();
      return m;
    },

    // Compact summaries of the most recent meetings (for memory injection).
    recentSummaries(n = 3) {
      return meetings
        .filter((m) => m.summary)
        .slice(-n)
        .map((m) => ({ id: m.id, title: m.title, startedAt: m.startedAt, summary: m.summary }));
    },

    search(q) {
      if (!q) return [];
      const needle = q.toLowerCase();
      return meetings
        .map((m) => ({ m, score: scoreMeeting(m, needle) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((x) => x.m)
        .slice(0, 20);
    },

    remove(id) {
      const before = meetings.length;
      meetings = meetings.filter((m) => m.id !== id);
      save();
      return meetings.length < before;
    },

    all() {
      return meetings.slice();
    }
  };
}

function scoreMeeting(m, needle) {
  let score = 0;
  // followUp arrives as an array from parseNotes but as a string from older
  // records, so flatten before matching rather than assuming either shape.
  const fields = [
    m.title,
    m.summary,
    ...[].concat(m.followUp || []),
    ...m.actionItems,
    ...m.transcript.map((t) => t.text)
  ];
  for (const f of fields) {
    if (typeof f !== 'string' || !f) continue;
    if (f.toLowerCase().includes(needle)) score += 1;
  }
  return score;
}

function newId() {
  return crypto.randomBytes(16).toString('hex');
}

module.exports = { createMeetingStore, normalizeMeeting, MAX_LOAD_BYTES };
