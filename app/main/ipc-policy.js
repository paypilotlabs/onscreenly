// @ts-check
// Pure rules for which IPC senders and payloads the main process accepts.
// Kept free of Electron so the rules are unit-tested directly.
const path = require('path');
const { fileURLToPath } = require('url');

// The only pages allowed to talk to the main process.
const TRUSTED_PAGES = new Set(['index.html', 'permissions.html']);

// Windows and macOS file systems are case-insensitive by default, and the
// frame URL's drive letter or path case need not match __dirname exactly.
const samePath =
  process.platform === 'win32' || process.platform === 'darwin'
    ? (a, b) => a.toLowerCase() === b.toLowerCase()
    : (a, b) => a === b;

/**
 * True when a frame URL is one of Onscreenly's own pages inside rendererDir.
 * Compares decoded file paths, not URL text, so install paths with spaces,
 * accents or other escaped characters still match. A #fragment is ignored: it
 * cannot change which document is loaded. Electron's loadFile leaves a '%'
 * from the folder name unescaped (".../Apps 100%/renderer/index.html"), which
 * strict URL decoding rejects, so such a '%' is read as a literal character.
 * @param {string} frameUrl
 * @param {string} rendererDir
 */
function isTrustedPageUrl(frameUrl, rendererDir) {
  let url;
  try {
    url = new URL(frameUrl);
  } catch {
    return false;
  }
  if (url.protocol !== 'file:' || url.search || url.host) return false;
  let filePath;
  try {
    filePath = fileURLToPath(url.href.replace(/%(?![0-9A-Fa-f]{2})/g, '%25'));
  } catch {
    return false;
  }
  return (
    samePath(path.dirname(filePath), path.resolve(rendererDir)) &&
    TRUSTED_PAGES.has(path.basename(filePath).toLowerCase())
  );
}

// System-settings panes the onboarding and permission screens link to. Anything
// else is refused: shell.openExternal would hand any URL to the OS.
const PANE_URL_PREFIXES = ['x-apple.systempreferences:com.apple.preference.security?Privacy_', 'ms-settings:privacy'];

/** @param {unknown} url */
function isAllowedPaneUrl(url) {
  return (
    typeof url === 'string' &&
    url.length <= 200 &&
    /^[\w.:?-]+$/.test(url) &&
    PANE_URL_PREFIXES.some((prefix) => url.startsWith(prefix))
  );
}

/** @param {unknown} value */
function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * @param {unknown} value
 * @param {number} maxLength
 */
function isShortString(value, maxLength) {
  return typeof value === 'string' && value.length <= maxLength;
}

const MAX_SETTINGS_PATCH_BYTES = 2 * 1024 * 1024; // résumé, job description and notes fit easily
const MAX_ASK_TEXT_CHARS = 20000;
const MAX_PCM_BYTES = 1024 * 1024; // a few seconds of 16 kHz mono PCM; chunks are far smaller

/** @param {unknown} patch */
function isValidSettingsPatch(patch) {
  if (!isPlainObject(patch)) return false;
  try {
    return Buffer.byteLength(JSON.stringify(patch)) <= MAX_SETTINGS_PATCH_BYTES;
  } catch {
    return false;
  }
}

/**
 * @param {unknown} payload
 * @param {Record<string, unknown>} modes
 */
function isValidAskPayload(payload, modes) {
  if (!isPlainObject(payload) || !modes || typeof modes !== 'object') return false;
  const { mode, text } = /** @type {{ mode?: unknown, text?: unknown }} */ (payload);
  if (typeof mode !== 'string' || !Object.prototype.hasOwnProperty.call(modes, mode)) return false;
  return text === undefined || text === null || isShortString(text, MAX_ASK_TEXT_CHARS);
}

/** @param {unknown} data */
function isValidPcmChunk(data) {
  if (data instanceof ArrayBuffer) return data.byteLength <= MAX_PCM_BYTES;
  if (ArrayBuffer.isView(data)) return data.byteLength <= MAX_PCM_BYTES;
  return false;
}

module.exports = {
  isTrustedPageUrl,
  isAllowedPaneUrl,
  isPlainObject,
  isShortString,
  isValidSettingsPatch,
  isValidAskPayload,
  isValidPcmChunk,
  MAX_ASK_TEXT_CHARS,
  MAX_PCM_BYTES
};
