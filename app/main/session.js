// Live session state shared across the main process: capture flags, the
// rolling transcript, meeting memory and the renderer channel. Other modules
// read and write these fields directly; keeping them on one object means a
// reassignment in one module is seen by all of them.
const session = {
  state: { capturing: false, busy: false, transcribing: { you: false, them: false } },
  sttDisabled: false, // set when the key can't reach any speech model (stops retry spam)
  transcript: [], // { channel, text, ts } — capped at MAX_TRANSCRIPT_TURNS
  meetingMemory: null, // persists the transcript per meeting + notes; see src/meetings/meeting-memory.js
  restoredTurns: [], // turns of an interrupted meeting resumed at launch, replayed to the renderer once
  // Which global shortcuts Onscreenly actually holds. `globalShortcut.register` returns
  // false when another application already owns the combination, and nothing used
  // to look at that — so the only symptom was a key that did nothing. Iris reads
  // this and can say which key is taken instead of guessing from a screenshot.
  shortcutState: { assist: false, say: false, leetcode: false, quit: false }
};

const MAX_TRANSCRIPT_TURNS = 200; // ~30–40 minutes of conversation at normal pace

let sender = () => {};
// The window module installs the real sender once it exists.
function setSender(fn) {
  sender = fn;
}
function send(channel, data) {
  sender(channel, data);
}

function pushTranscript(turn) {
  const { transcript } = session;
  transcript.push(turn);
  if (transcript.length > MAX_TRANSCRIPT_TURNS) transcript.splice(0, transcript.length - MAX_TRANSCRIPT_TURNS);
  if (session.meetingMemory) session.meetingMemory.onTurn(turn);
}

function publishTranscript(channel, text) {
  if (!text || !text.trim()) return;
  const turn = { channel, text: text.trim(), ts: Date.now() };
  pushTranscript(turn);
  send('transcript', turn);
  send('stt:final', { channel, text: turn.text });
}

module.exports = { session, MAX_TRANSCRIPT_TURNS, setSender, send, pushTranscript, publishTranscript };
