// @ts-check
// Durable, atomic JSON file persistence for onscreenly's settings store.
//
// Why this exists as its own module: the previous store wrote the settings
// file with a bare fs.writeFileSync (which truncates the destination before
// writing) and swallowed every error. A crash or power loss mid-write left
// corrupt JSON, and the next load() then silently reset every saved API key
// and setting to blank — unrecoverable, because the very next save overwrote
// whatever remained. It also could not be unit tested at all on its own,
// because src/store.js calls app.getPath('userData') at require time, which
// throws outside Electron.
//
// This module owns only the file mechanics — not onscreenly's settings schema or
// defaults, which stay in src/store.js as the single source of truth for
// what a "settings object" is. Writes are atomic:
//   1. serialize to FILE.tmp                (a crash here leaves the real file intact)
//   2. copy the previous FILE to FILE.bak   (best-effort, one generation)
//   3. rename TMP over FILE                 (atomic replace, Windows-safe in Node;
//                                            falls back to an in-place write when
//                                            another process briefly holds FILE —
//                                            e.g. antivirus on Windows)
// On load, a corrupt or truncated FILE is recovered from FILE.bak before
// falling back to "nothing on disk yet", and every failure is logged instead
// of swallowed. The file (and its .tmp/.bak siblings) are always written
// 0600: this holds every BYO API key plus the publik key. 0600 is a no-op on
// Windows, where ACLs already default to the owning user.
const fs = require('fs');
const path = require('path');

const FILE_MODE = 0o600;

/**
 * @param {() => string} resolveUserDataDir
 * @param {string | ((dir: string) => string)} label
 * @param {{ maxBytes?: number, validate?: (data: unknown) => boolean, compact?: boolean }} [options]
 *   maxBytes: a larger file is reported (tooLarge) without being read or parsed.
 *   validate: parsed JSON that fails it counts as corrupt, like unparseable JSON.
 *   compact: write without indentation (large files).
 */
function createFileStore(resolveUserDataDir, label, options = {}) {
  const { maxBytes = 0, validate = null, compact = false } = options;
  // Resolved lazily so merely requiring this module never touches Electron.
  let filePath = null;
  function mainPath() {
    if (!filePath) {
      const directory = resolveUserDataDir();
      if (typeof label === 'function') label = label(directory);
      filePath = path.join(directory, label);
    }
    return filePath;
  }
  const tmpPath = () => mainPath() + '.tmp';
  const bakPath = () => mainPath() + '.bak';

  function readJson(candidate) {
    const data = JSON.parse(fs.readFileSync(candidate, 'utf8'));
    if (validate && !validate(data)) throw new Error('unexpected contents');
    return data;
  }

  function sizeOf(candidate) {
    try {
      return fs.statSync(candidate).size;
    } catch (_) {
      return -1;
    }
  }

  function chmodQuiet(target) {
    try {
      fs.chmodSync(target, FILE_MODE);
    } catch (_) {
      /* e.g. unsupported on this fs */
    }
  }

  /**
   * @returns {{ data: any, recoveredFromBackup: boolean, mainCorrupt?: boolean, tooLarge?: boolean, size?: number } | null}
   *   null means there is nothing on disk yet — the caller starts from
   *   defaults. data is null (with mainCorrupt) when the main file exists but
   *   neither it nor its backup is usable; it is left in place, so the caller
   *   can quarantineMain() it before the next save would copy it over the
   *   backup. tooLarge means the main file is over maxBytes and was not read.
   */
  function load() {
    let mainMissing = false;
    const size = sizeOf(mainPath());
    if (maxBytes && size > maxBytes) return { data: null, recoveredFromBackup: false, tooLarge: true, size };
    try {
      return { data: readJson(mainPath()), recoveredFromBackup: false };
    } catch (e) {
      mainMissing = e && e.code === 'ENOENT';
      if (!mainMissing) console.error('[onscreenly] cannot read ' + mainPath() + ':', e && e.message);
    }

    // The main file is gone or unusable. A stale .bak from the previous good
    // save is strictly better than blanking every key the user has stored.
    try {
      if (maxBytes && sizeOf(bakPath()) > maxBytes) throw new Error('backup is too large to load');
      const data = readJson(bakPath());
      console.error('[onscreenly] ' + label + ' was lost or corrupt — recovered it from backup');
      return mainMissing ? { data, recoveredFromBackup: true } : { data, recoveredFromBackup: true, mainCorrupt: true };
    } catch (bakErr) {
      if (!(bakErr && bakErr.code === 'ENOENT')) {
        console.error('[onscreenly] cannot read backup ' + bakPath() + ':', bakErr && bakErr.message);
      }
    }

    if (mainMissing) return null;
    console.error('[onscreenly] no usable backup for ' + label + '; starting from defaults');
    return { data: null, recoveredFromBackup: false, mainCorrupt: true };
  }

  // Moves an unreadable main file aside (FILE.corrupt-<time>) so nothing overwrites it: the next
  // save would otherwise copy it over a good .bak, then replace it. Returns the new path, or null.
  function quarantineMain() {
    const target = `${mainPath()}.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    try {
      fs.renameSync(mainPath(), target);
      chmodQuiet(target);
      return target;
    } catch (e) {
      console.error('[onscreenly] could not set aside ' + mainPath() + ':', e && e.message);
      return null;
    }
  }

  const serialize = (data) => (compact ? JSON.stringify(data) : JSON.stringify(data, null, 2));

  // Serialize → snapshot the previous good state → atomic replace. Throws on
  // failure rather than swallowing it, so the caller can surface a save error
  // instead of silently pretending the write succeeded.
  function persist(data) {
    const json = serialize(data);
    fs.writeFileSync(tmpPath(), json, { mode: FILE_MODE });
    try {
      if (fs.existsSync(mainPath())) fs.copyFileSync(mainPath(), bakPath());
      chmodQuiet(bakPath());
    } catch (_) {
      /* backup is best-effort; never block the save */
    }
    try {
      fs.renameSync(tmpPath(), mainPath());
    } catch (_) {
      // Windows: antivirus/indexers can hold the target open for a moment,
      // making rename fail with EPERM. An in-place write still beats losing
      // the user's keys over a transient lock.
      fs.writeFileSync(mainPath(), json, { mode: FILE_MODE });
      try {
        fs.unlinkSync(tmpPath());
      } catch (_) {}
    }
    // writeFileSync's mode option only applies when the file is created; a
    // pre-existing tmp/main file (from a previous run, or on the in-place
    // fallback above) keeps its old permissions unless forced here.
    chmodQuiet(mainPath());
  }

  // persist() without blocking the main process on the file system: the same
  // temp → backup → rename steps, on fs.promises. Rejects on failure.
  async function persistAsync(data) {
    const json = serialize(data);
    await fs.promises.writeFile(tmpPath(), json, { mode: FILE_MODE });
    try {
      await fs.promises.copyFile(mainPath(), bakPath());
      chmodQuiet(bakPath());
    } catch (_) {
      /* no previous file yet, or backup failed: never block the save */
    }
    try {
      await fs.promises.rename(tmpPath(), mainPath());
    } catch (_) {
      await fs.promises.writeFile(mainPath(), json, { mode: FILE_MODE });
      await fs.promises.unlink(tmpPath()).catch(() => {});
    }
    chmodQuiet(mainPath());
  }

  return { load, persist, persistAsync, quarantineMain, mainPath, tmpPath, bakPath };
}

module.exports = { createFileStore };
