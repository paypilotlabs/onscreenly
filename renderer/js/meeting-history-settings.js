// Settings › API keys › Your data › Meeting history: how many meetings to keep, deleting the
// history, and archiving one too large to load. Main confirms before anything is deleted.
import { $, onscreenly } from './core.js';

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function render(info) {
  if (!info) return;
  $('#meeting-keep').value = String(info.keep);
  const note = $('#meeting-history-note');
  const tooLarge = info.state === 'too-large';
  note.classList.toggle('warn', tooLarge);
  if (tooLarge) {
    note.textContent = `Your history (${formatSize(info.bytes)}) is too large to load, so new meetings aren’t saved. Archive it to start a new one; the file is kept, not deleted.`;
  } else if (info.keep === 0) {
    note.textContent = info.count
      ? `New meetings aren’t saved. ${info.count} earlier ${info.count === 1 ? 'meeting is' : 'meetings are'} still on this computer.`
      : 'New meetings aren’t saved.';
  } else if (!info.count) {
    note.textContent = 'No meetings saved yet. Transcripts and notes stay on this computer.';
  } else {
    note.textContent = `${info.count} ${info.count === 1 ? 'meeting' : 'meetings'} · ${formatSize(info.bytes)} on this computer.`;
  }
  $('#meeting-archive').classList.toggle('hidden', !tooLarge);
  $('#meeting-delete').disabled = !info.count && !tooLarge;
}

function refresh() {
  return onscreenly
    .meetingsInfo()
    .then(render)
    .catch(() => {});
}

export function init() {
  $('#meeting-keep').addEventListener('change', async (e) => {
    const keep = Number(e.target.value);
    // A cancelled confirmation puts the select back.
    render(await onscreenly.meetingsSetRetention(keep).catch(() => null));
    refresh();
  });
  $('#meeting-delete').addEventListener('click', async () => {
    render(await onscreenly.meetingsDeleteHistory().catch(() => null));
  });
  $('#meeting-archive').addEventListener('click', async () => {
    const result = await onscreenly.meetingsArchiveOversized().catch(() => null);
    render(result);
    if (result && result.archived)
      $('#meeting-history-note').textContent = `Archived as ${result.archived}. New meetings are saved again.`;
  });
}

export { refresh as refreshMeetingHistory };
