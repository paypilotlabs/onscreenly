// @ts-check
// Meeting memory — wires the meeting store (meetings.js) and notes (notes.js)
// into the live transcript so onscreenly remembers what was said:
//   • every transcript turn is persisted as it lands (survives a crash/restart)
//   • an interrupted meeting is resumed on the next launch if it is recent
//   • when listening stops, notes (summary / decisions / action items) are
//     written with the LLM and stored; earlier-ended meetings without notes
//     are caught up in the background on launch
//   • the last few meeting summaries are offered as a "previous meetings"
//     block for prompts
// All I/O and the LLM are injected so the lifecycle is unit-testable.

const { buildNotesPrompt, parseNotes } = require('./notes');

const NOTES_SYSTEM =
  'You are onscreenly, writing private meeting notes for the user ("You") from a transcript of a conversation with ' +
  'another party ("Them"). Be factual and specific: keep names, numbers, dates and commitments exactly as said; ' +
  'never invent details that are not in the transcript. Write in clear English.';

const DEFAULTS = {
  resumeWindowMs: 30 * 60 * 1000, // an open meeting whose last turn is older than this is treated as over
  minTurnsForNotes: 4, // fewer than this is a false start, not a meeting worth notes
  maxMeetings: 50, // kept on disk; oldest are pruned (getKeep() from settings wins when given)
  memoryCount: 3, // summaries offered to prompts
  maxTranscriptChars: 200_000, // about 3.5 hours of speech; then the meeting continues as a new record
  maxNotesAttempts: 2 // a meeting whose notes keep failing is not re-sent to the provider at every launch
};

function createMeetingMemory(opts) {
  const { store, llmFactory } = opts;
  const now = opts.now || Date.now;
  const log = opts.log || (() => {});
  const cfg = { ...DEFAULTS, ...opts };
  let current = null; // the meeting the live transcript is being written to
  let notesTurnCount = 0; // transcript length when notes were last written for `current`
  let notesInFlight = null;
  let disposed = false;
  // How many meetings to keep on disk; 0 means meeting history is not saved at all.
  const keep = () => {
    const n = typeof opts.getKeep === 'function' ? opts.getKeep() : cfg.maxMeetings;
    return Number.isFinite(n) && n >= 0 ? n : cfg.maxMeetings;
  };
  const transcriptChars = (m) => m.transcript.reduce((n, t) => n + (t.text ? t.text.length : 0), 0);

  function lastTurnTs(m) {
    return m.transcript.length ? m.transcript[m.transcript.length - 1].ts : m.startedAt;
  }

  function titleFor(summary, startedAt) {
    const first = (summary || '').split(/(?<=[.!?])\s/)[0].trim();
    if (first) return first.length > 60 ? first.slice(0, 57).trimEnd() + '…' : first;
    return 'Meeting on ' + new Date(startedAt).toLocaleDateString();
  }

  // Write notes for a meeting with the LLM. Resolves to the parsed notes, or
  // null when there is nothing to do (too short, no usable provider, failure).
  async function writeNotes(m) {
    if (disposed || !m || m.transcript.length < cfg.minTurnsForNotes) return null;
    const llm = llmFactory();
    if (!llm || !llm.ready) return null;
    // A meeting deleted (or the whole history cleared) while the notes were being written must not
    // come back when they arrive.
    const stillThere = () => !disposed && store.get(m.id) === m;
    const failedOnce = () => {
      if (stillThere()) store.update(m.id, { notesAttempts: (m.notesAttempts || 0) + 1 });
    };
    try {
      const text = await llm.stream({
        system: NOTES_SYSTEM,
        turns: [{ role: 'user', text: buildNotesPrompt(m.transcript) }],
        onToken: () => {}
      });
      if (!stillThere()) return null;
      const notes = parseNotes(text);
      if (!notes.summary) {
        failedOnce();
        return null;
      }
      store.update(m.id, {
        ...notes,
        title: titleFor(notes.summary, m.startedAt),
        notesAt: now(),
        notesTurns: m.transcript.length
      });
      log(`notes written for meeting ${m.id} (${m.transcript.length} turns)`);
      return notes;
    } catch (e) {
      log(`notes failed for meeting ${m.id}: ${e && e.message}`);
      failedOnce();
      return null;
    }
  }

  return {
    get current() {
      return current;
    },

    // On launch: pick up a meeting that was still open (no endedAt) if its last
    // turn is recent enough to plausibly be the same conversation. Returns the
    // turns to restore into the live transcript ([] when nothing to resume).
    resumeOpen() {
      const all = store.all();
      const last = all[all.length - 1];
      if (!last || last.endedAt) return [];
      if (now() - lastTurnTs(last) <= cfg.resumeWindowMs) {
        current = last;
        notesTurnCount = last.notesTurns || 0;
        log(`resumed meeting ${last.id} (${last.transcript.length} turns)`);
        return last.transcript.slice();
      }
      store.update(last.id, { endedAt: lastTurnTs(last) }); // stale: close it, notes get caught up
      return [];
    },

    // Every live transcript turn lands here. A meeting opens on the first
    // turn; a long silence since the previous turn means the last one is over.
    onTurn(turn) {
      if (disposed || keep() === 0) return; // meeting history is off, or being deleted
      if (current && now() - lastTurnTs(current) > cfg.resumeWindowMs) this.end();
      // A very long conversation continues as a new record, so no single meeting (and no notes
      // prompt) grows without bound. Nothing is dropped.
      let continuedFrom = null;
      if (current && transcriptChars(current) >= cfg.maxTranscriptChars) {
        continuedFrom = current.id;
        this.end();
      }
      if (!current) {
        current = store.add();
        if (continuedFrom) store.update(current.id, { continuedFrom });
        notesTurnCount = 0;
        store.prune(keep());
        log(`meeting ${current.id} started${continuedFrom ? ` (continues ${continuedFrom})` : ''}`);
      }
      store.addTurn(current.id, turn);
    },

    // Listening stopped (or the user asked): refresh the notes for the current
    // meeting if there is anything new. Background — callers need not await.
    refreshNotes() {
      if (!current || current.transcript.length === notesTurnCount) return Promise.resolve(null);
      if (notesInFlight) return notesInFlight;
      const m = current;
      const count = m.transcript.length;
      notesInFlight = writeNotes(m)
        .then((notes) => {
          if (notes && current === m) notesTurnCount = count;
          return notes;
        })
        .finally(() => {
          notesInFlight = null;
        });
      return notesInFlight;
    },

    // Close the current meeting (transcript cleared, quit, or a long gap).
    // Returns the notes promise so a caller can wait for them if it wants to.
    end() {
      if (!current) return Promise.resolve(null);
      const m = current;
      store.update(m.id, { endedAt: now() });
      const notes = this.refreshNotes();
      current = null;
      notesTurnCount = 0;
      log(`meeting ${m.id} ended (${m.transcript.length} turns)`);
      return notes;
    },

    // Launch-time catch-up: meetings that ended without notes (quit, crash).
    async catchUp() {
      const pending = store
        .all()
        .filter(
          (m) =>
            m.endedAt &&
            !m.summary &&
            m.transcript.length >= cfg.minTurnsForNotes &&
            (m.notesAttempts || 0) < cfg.maxNotesAttempts
        );
      let written = 0;
      for (const m of pending) {
        if (disposed) break;
        if (await writeNotes(m)) written++;
      } // sequential: one provider call at a time
      return written;
    },

    // "Previous meetings" context for prompts — summaries only, never full
    // transcripts, and never the meeting that is happening right now.
    memoryBlock() {
      if (keep() === 0) return null;
      const items = store
        .recentSummaries(cfg.memoryCount + 1)
        .filter((m) => !current || m.id !== current.id)
        .slice(-cfg.memoryCount);
      if (!items.length) return null;
      const lines = items.map((m) => `- ${new Date(m.startedAt).toLocaleDateString()} — ${m.title}: ${m.summary}`);
      return 'Previous meetings (for background only; the live transcript is what matters now):\n' + lines.join('\n');
    },

    flush() {
      return store.flush();
    },

    // Stops recording and any write still on its way (notes included): used before the history is
    // deleted, so nothing that is already in memory can bring it back.
    dispose() {
      disposed = true;
      current = null;
      notesTurnCount = 0;
      store.close();
    },

    // Deletes every meeting but keeps recording new ones.
    clearHistory() {
      current = null;
      notesTurnCount = 0;
      store.clearAll();
    }
  };
}

module.exports = { createMeetingMemory, NOTES_SYSTEM };
