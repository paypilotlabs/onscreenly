// Meeting history controls behind Settings › API keys › Your data: how many meetings to keep,
// deleting the history, and archiving a history too large to load. Every step that removes
// meetings asks first and says exactly what goes.
const path = require('path');
const { dialog } = require('electron');
const { handle } = require('./ipc-guard');
const store = require('../../src/storage/store');
const { session } = require('./session');
const { getWin } = require('./window');

const KEEP_CHOICES = [0, 10, 25, 50, 100];
const DEFAULT_KEEP = 50;

/** How many meetings to keep; 0 means meeting history is not saved. */
function meetingHistoryKeep(settings) {
  const keep = settings && settings.meetingHistory && settings.meetingHistory.keep;
  return KEEP_CHOICES.includes(keep) ? keep : DEFAULT_KEEP;
}

function info() {
  const base = session.meetingStore
    ? session.meetingStore.info()
    : { count: 0, bytes: 0, state: 'ok', writable: false };
  return { ...base, keep: meetingHistoryKeep(store.getSettings()), choices: KEEP_CHOICES };
}

async function confirm(message, detail, action) {
  const { response } = await dialog.showMessageBox(getWin(), {
    type: 'warning',
    buttons: ['Cancel', action],
    defaultId: 0,
    cancelId: 0,
    message,
    detail
  });
  return response === 1;
}

const plural = (n) => `${n} meeting${n === 1 ? '' : 's'}`;

function registerMeetingHistoryIpc() {
  handle('meetings:info', () => info());

  handle('meetings:set-retention', async (_e, keep) => {
    if (!KEEP_CHOICES.includes(keep)) throw new Error('Refused: unknown retention choice');
    const meetingStore = session.meetingStore;
    const count = meetingStore ? meetingStore.info().count : 0;
    const removed = keep > 0 ? Math.max(0, count - keep) : 0;
    if (
      removed &&
      !(await confirm(
        `Keep only the ${keep} most recent meetings?`,
        `The ${plural(removed)} before them will be deleted from this computer, with their transcripts and notes. This cannot be undone.`,
        `Delete ${plural(removed)}`
      ))
    ) {
      return { ...info(), changed: false };
    }
    store.setSettings({ meetingHistory: { keep } });
    if (removed && meetingStore) meetingStore.prune(keep);
    return { ...info(), changed: true };
  });

  handle('meetings:delete-history', async () => {
    const count = session.meetingStore ? session.meetingStore.info().count : 0;
    const ok = await confirm(
      'Delete your meeting history?',
      `This deletes ${plural(count)} from this computer, with their transcripts and notes. Your settings, API keys and résumé are kept. This cannot be undone.`,
      'Delete meeting history'
    );
    if (!ok) return { ...info(), deleted: false };
    if (session.meetingMemory) session.meetingMemory.clearHistory();
    return { ...info(), deleted: true };
  });

  handle('meetings:archive-oversized', () => {
    const archived = session.meetingStore ? session.meetingStore.archiveOversized() : null;
    return { ...info(), archived: archived ? path.basename(archived) : null };
  });
}

module.exports = { meetingHistoryKeep, registerMeetingHistoryIpc, KEEP_CHOICES };
