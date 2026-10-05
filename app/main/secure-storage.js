// Electron's safeStorage as the encryption backend for src/storage/secrets.js.
// Uses the asynchronous API: the synchronous one is deprecated in Electron 45
// and removed in 46. Both use the same OS key stores.
const { safeStorage } = require('electron');

const safeStorageBackend = {
  isAvailable: () => safeStorage.isAsyncEncryptionAvailable(),
  // On Linux without GNOME Keyring or KWallet, safeStorage falls back to a
  // fixed key ('basic_text'): the file is obfuscated, not protected.
  isWeak: () => process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text',
  encrypt: (plainText) => safeStorage.encryptStringAsync(plainText),
  decrypt: async (encrypted) => (await safeStorage.decryptStringAsync(encrypted)).result
};

module.exports = { safeStorageBackend };
