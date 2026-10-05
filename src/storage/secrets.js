// @ts-check
// Encrypted storage for provider API keys.
//
// The keys live in <userData>/secrets.bin, encrypted by the operating system's
// key store through Electron's safeStorage (Keychain on macOS, DPAPI on
// Windows, libsecret/kwallet on Linux). The settings JSON then carries blank
// key fields. The encryption backend is injected so this file runs under plain
// `node --test`; app/main/secure-storage.js supplies the real one.
const fs = require('fs');
const path = require('path');

const FILE_MODE = 0o600;
const SECRETS_FILENAME = 'secrets.bin';

/**
 * @typedef {object} EncryptionBackend
 * @property {() => Promise<boolean>} isAvailable
 * @property {() => boolean} isWeak  true when keys are only obfuscated (Linux without a keyring)
 * @property {(plainText: string) => Promise<Buffer>} encrypt
 * @property {(encrypted: Buffer) => Promise<string>} decrypt
 */

/**
 * @param {() => string} resolveDir
 * @param {EncryptionBackend} backend
 */
function createSecretsFile(resolveDir, backend) {
  const mainPath = () => path.join(resolveDir(), SECRETS_FILENAME);
  const tmpPath = () => mainPath() + '.tmp';

  /** @returns {Promise<Record<string, string> | null>} null when nothing is stored yet */
  async function read() {
    let encrypted;
    try {
      encrypted = fs.readFileSync(mainPath());
    } catch (e) {
      if (e && e.code === 'ENOENT') return null;
      throw e;
    }
    const parsed = JSON.parse(await backend.decrypt(encrypted));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('secrets.bin is not a key map');
    /** @type {Record<string, string>} */
    const keys = {};
    for (const [name, value] of Object.entries(parsed)) if (typeof value === 'string') keys[name] = value;
    return keys;
  }

  /** @param {Record<string, string>} keys */
  async function write(keys) {
    const encrypted = await backend.encrypt(JSON.stringify(keys));
    fs.writeFileSync(tmpPath(), encrypted, { mode: FILE_MODE });
    fs.renameSync(tmpPath(), mainPath());
    try {
      fs.chmodSync(mainPath(), FILE_MODE);
    } catch (_) {
      /* unsupported on this file system */
    }
  }

  function remove() {
    for (const target of [mainPath(), tmpPath()]) {
      try {
        fs.unlinkSync(target);
      } catch (e) {
        if (!(e && e.code === 'ENOENT')) throw e;
      }
    }
  }

  return { read, write, remove, mainPath };
}

/**
 * What Settings shows next to the keys: whether they are protected and how.
 * @param {'pending' | 'encrypted' | 'weak' | 'unavailable' | 'unreadable'} mode
 * @param {NodeJS.Platform} platform
 */
function describeKeyStorage(mode, platform) {
  const store =
    platform === 'darwin' ? 'macOS Keychain' : platform === 'win32' ? 'Windows (DPAPI)' : 'your system keyring';
  switch (mode) {
    case 'encrypted':
      return { mode, protected: true, message: `API keys are encrypted with ${store}.` };
    case 'weak':
      return {
        mode,
        protected: false,
        message:
          'No system keyring was found, so API keys are only obfuscated on disk. Install GNOME Keyring or KWallet and restart Onscreenly to encrypt them.'
      };
    case 'unreadable':
      return {
        mode,
        protected: true,
        message: `Saved API keys could not be decrypted with ${store} (the key store may have been reset). Enter them again to save them encrypted.`
      };
    case 'unavailable':
      return {
        mode,
        protected: false,
        message: 'Encryption is not available on this system, so API keys are saved as plain text in the settings file.'
      };
    default:
      return { mode, protected: false, message: '' };
  }
}

// Settings shows a saved key as this mask; a save that sends the mask back
// unchanged keeps the stored key, so the renderer never needs the real value.
const MASK_PREFIX = '••••••••';

/** @param {string} key */
function maskKey(key) {
  if (!key) return '';
  return MASK_PREFIX + (key.length > 8 ? key.slice(-4) : '');
}

module.exports = { createSecretsFile, describeKeyStorage, maskKey, SECRETS_FILENAME };
