// @ts-check
// Simple JSON-file settings store (avoids native modules so `npm install` stays clean).
//
// The durable-write mechanics (atomic temp+rename, .bak snapshot, corruption
// recovery, 0600 permissions) live in ./settings-store-core so they can be
// unit tested without Electron; this file owns the schema, defaults and
// public surface (getSettings/setSettings/etc.) as before.
const fs = require('fs');
const { app } = require('electron');
const { createFileStore } = require('./settings-store-core');
const { createSecretsFile, describeKeyStorage, maskKey } = require('./secrets');
const { normalizeBaseUrl } = require('../llm/openai-compatible');
const { DEFAULT_KNOWLEDGE, normalizeKnowledge } = require('../knowledge/knowledge-context');
const { APP_ID, resolveSettingsFilename } = require('../platform/app-identity');

const fileStore = createFileStore(() => app.getPath('userData'), resolveSettingsFilename);

// Cap on the user's custom response rules. Generous but bounded: anything longer
// should live in a real prompt file, not in a settings field.
const MAX_AI_RULES_CHARS = 2000;

const DEFAULTS = {
  provider: 'openai',
  sttProvider: 'auto',
  localWhisper: {
    modelId: 'base.en',
    language: 'auto',
    threads: 0
  },
  smart: false,
  // Meeting (system) audio. On macOS it needs the separate System Audio Recording
  // permission and may show the OS recording indicator, so it is opt-in there;
  // Windows/Linux loopback capture needs neither, so it stays on.
  meetingAudio: process.platform !== 'darwin',
  baseUrl: '',
  minimaxRegion: 'global_en',
  apiKeys: {
    cerebras: '',
    openai: '',
    anthropic: '',
    gemini: '',
    deepgram: '',
    custom: '',
    ollama: '',
    groq: '',
    minimax: '',
    deepseek: '',
    azure: '',
    publik: ''
  },
  azureEndpoint: '',
  // publik API (packaged-build default). apiKeys.publik holds the minted key;
  // everything here is state the main process owns — the renderer only reads
  // a redacted view of it through publik:state and can never write it.
  publik: {
    installId: '', // uuid minted locally before the first provision; idempotency key server-side
    keyId: '', // pk_live_<this>_… — safe to show
    baseUrl: '', // '' = build default; the provisioning response's base_url wins
    claimUrl: '', // where "Link this computer" goes until the install is claimed
    claimCode: '',
    claimState: '', // 'anonymous' | 'claimed' — last seen from the gateway
    starterMicros: 0, // from the mint response; 0 for every mint since policy 0059 — only an install minted before it still carries its old starter
    balanceMicros: null, // last known available balance (headers or GET /wallet)
    balanceAt: 0,
    wallet: null, // last GET /wallet, normalised (src/publik.js normalizeWallet)
    disclosureAccepted: 0, // disclosureVersion the user accepted; 0 = not yet
    defaultApplied: false, // provider was switched to publik once, automatically
    revoked: false, // last call was 401 → Reconnect re-mints
    disconnected: false, // 401 key_revoked with reprovision:false → user removed this computer
    cardShown: false, // the first-run card (CONTRACT §12.1) was shown for the current starter grant
    lastError: ''
  },
  // Tab 2: Profile
  resumeText: '',
  jobDescription: '',
  // Tab 3: Interview Prep
  starStories: '', // 3-5 behavioral STAR stories in plain English
  whyCompany: '', // Why do you want to work here?
  whyLeaving: '', // Why are you leaving your current job?
  workStyle: '', // How you work, decision-making style, values
  // Tab 4: Q&A
  salaryTarget: '', // e.g. "$150k-$180k base + equity"
  questionsToAsk: '', // Questions to ask the interviewer
  // Tab 5: Style — custom response rules
  // The user writes how the AI should write: e.g. "no em-dashes", "use bullet
  // points", "casual tone". Applied to every LLM mode EXCEPT LeetCode (kept
  // strict for coding problems).
  aiRules: '',
  // Knowledge: a read-only Obsidian vault searched for notes that match each
  // question. vaultPath is set only by the main process's folder picker.
  knowledge: DEFAULT_KNOWLEDGE,
  // Overlay opacity (1 = fully opaque). Clamped so the window never vanishes.
  opacity: 1,
  // Slides: opt-in auto slide tracking (memory-only, forwarded, never written to disk).
  slides: {
    enabled: false,
    intervalMs: 3000,
    threshold: 5,
    maxSlides: 50
  },
  // Per-caller consent for the app-link get_slides action, separate from the
  // link's coarse read/action scopes: a caller already trusted to start/stop
  // listening (scope "action") is NOT automatically trusted to read slide
  // captions too. Keyed by app-link caller id; value is 'granted' or 'denied'.
  applinkSlidesConsent: {}, // Legacy Cue decisions, retained but not honored by the new app identity.
  applinkSlidesConsentByApp: {},
  // How many meetings to keep (0 = don't save meeting history). Changed through the
  // meetings:set-retention IPC, which confirms before deleting anything.
  meetingHistory: { keep: 50 },
  // Once per launch, ask GitHub's releases page whether a newer version exists (Settings › Your data).
  checkForUpdates: true,
  // Global shortcuts the user changed (action -> Electron accelerator); the rest use the defaults in
  // src/platform/shortcuts.js. Written through the shortcuts:set IPC, which validates them.
  shortcuts: {},
  // Window position
  windowX: null,
  windowY: null,
  models: {
    cerebras: { fast: 'qwen-3.8-27b', smart: 'qwen-3.8-27b' },
    openai: { fast: 'gpt-4o-mini', smart: 'gpt-4o' },
    // Kept in sync with CURRENT_ANTHROPIC_DEFAULT_FAST/_SMART in src/llm.js —
    // claude-3-5-haiku-latest/claude-3-5-sonnet-latest (the previous defaults
    // here) were retired by Anthropic and 404 on every request. This is the
    // block createLLM() actually reads by default (settings.models[provider],
    // not src/llm.js's DEFAULT_MODELS, which only backstops a missing entry) —
    // llm.js's DEAD_ANTHROPIC_MODEL_RE self-heal additionally migrates any
    // settings file already saved with the old dead ids.
    anthropic: { fast: 'claude-haiku-4-5-20251001', smart: 'claude-sonnet-4-5-20250929' },
    // fast is kept in sync with CURRENT_GEMINI_DEFAULT in src/llm.js —
    // gemini-2.0-flash (the original default here) was retired by Google on
    // 2026-03-03 and 404s on every request. smart is the newest Pro release.
    gemini: { fast: 'gemini-3.8-flash', smart: 'gemini-3.1-pro-preview' },
    custom: { fast: '', smart: '' },
    ollama: { fast: 'llama3.2', smart: 'llama3.3' },
    groq: { fast: 'llama-3.1-8b-instant', smart: 'llama-3.3-70b-versatile' },
    minimax: { fast: 'MiniMax-M2.7', smart: 'MiniMax-M3' },
    // deepseek-chat/deepseek-reasoner were retired 2026-07-24; deepseek-flash
    // (non-thinking) and deepseek-v4-pro (thinking) are the current aliases.
    deepseek: { fast: 'deepseek-flash', smart: 'deepseek-v4-pro' },
    azure: { fast: 'gpt-4o-mini', smart: 'gpt-4o' },
    // Tier aliases, never upstream slugs; the provisioning response overrides them.
    publik: { fast: 'publik-fast', smart: 'publik-balanced' }
  }
};

// Fields the renderer may never write. settings:set passes patches through
// stripRendererPatch; settings:get hands out redactForRenderer's view.
const MIN_OPACITY = 0.2;
const MAX_OPACITY = 1;

function clampOpacity(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_OPACITY, Math.max(MIN_OPACITY, Math.round(n * 100) / 100));
}

const RENDERER_READ_ONLY = [
  'publik',
  'applinkSlidesConsent',
  'applinkSlidesConsentByApp',
  'windowX',
  'windowY',
  'meetingHistory',
  'shortcuts'
];
// Settings the renderer may write that have no default of their own (absent until first set).
const RENDERER_EXTRA_FIELDS = { onboarded: false, sttModel: '', resumeContext: '' };

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

// Keeps only what has the same shape as the default it would replace: strings for strings,
// finite numbers for numbers, objects (checked field by field) for objects. Anything else is
// dropped, so one wrong-typed or unknown field can neither erase a block of settings (apiKeys:null
// wiped every saved key) nor be written to disk. Returns undefined when nothing usable is left.
function sanitizeLike(shape, value) {
  if (isPlainObject(shape)) {
    if (!isPlainObject(value)) return undefined;
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (!Object.prototype.hasOwnProperty.call(shape, k)) continue;
      const clean = sanitizeLike(shape[k], v);
      if (clean !== undefined) out[k] = clean;
    }
    return out;
  }
  if (Array.isArray(shape)) return Array.isArray(value) ? value : undefined;
  if (typeof shape === 'number') return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  if (typeof shape === 'string' || typeof shape === 'boolean') return typeof value === typeof shape ? value : undefined;
  return undefined;
}

let data = null;
let lastError = null;

// -------- API key encryption --------
// Until initSecureStorage() runs (at app start, once safeStorage is usable),
// keys stay where they were. Afterwards they live only in memory and in the
// encrypted secrets.bin; the settings JSON carries blank key fields.
/** @type {'pending' | 'encrypted' | 'weak' | 'unavailable' | 'unreadable'} */
let keyMode = 'pending';
/** @type {ReturnType<typeof createSecretsFile> | null} */
let secretsFile = null;
let secretsWrite = Promise.resolve();
let lastWrittenKeys = null; // JSON of the key map secrets.bin holds
let secretsError = null; // the last failed encrypted-key write, until one succeeds

// The Ollama "key" field holds a local URL, not a secret, so Settings shows it as is.
const UNMASKED_KEYS = new Set(['ollama']);

function keysLiveInSecretsFile() {
  return keyMode === 'encrypted' || keyMode === 'weak' || keyMode === 'unreadable';
}

function nonEmptyKeys(keys) {
  const out = {};
  for (const [name, value] of Object.entries(keys || {})) if (typeof value === 'string' && value) out[name] = value;
  return out;
}

function withBlankKeys(settings) {
  const apiKeys = {};
  for (const name of Object.keys(settings.apiKeys || {})) apiKeys[name] = '';
  return { ...settings, apiKeys };
}

// What goes into the settings JSON.
function persistable(settings) {
  return keysLiveInSecretsFile() ? withBlankKeys(settings) : settings;
}

function queueSecretsWrite() {
  const snapshot = JSON.stringify(nonEmptyKeys(data.apiKeys));
  if (snapshot === lastWrittenKeys) return;
  // An undecryptable secrets.bin may only be unreadable for now (a locked key
  // store); it is replaced once the user actually saves a key, not before.
  if (keyMode === 'unreadable' && snapshot === '{}') return;
  const file = secretsFile;
  secretsWrite = secretsWrite
    .catch(() => {})
    .then(async () => {
      await file.write(JSON.parse(snapshot));
      lastWrittenKeys = snapshot;
      secretsError = null;
      if (keyMode === 'unreadable') keyMode = 'encrypted';
    })
    .catch((e) => {
      // A key store that fails once (locked, busy) is not a reason to write the key to disk in
      // plain text for the rest of the session. The key stays in memory, the next save retries,
      // and settings:set reports the failure instead of "Saved".
      console.error('[onscreenly] could not write encrypted API keys:', e && e.message);
      secretsError = e;
    });
}

function backupHasPlaintextKeys() {
  try {
    const backup = JSON.parse(fs.readFileSync(fileStore.bakPath(), 'utf8'));
    return Object.keys(nonEmptyKeys(backup && backup.apiKeys)).length > 0;
  } catch (_) {
    return false;
  }
}

/**
 * Moves API keys into secrets.bin, encrypted by the OS key store. Called once
 * at startup after app 'ready'. Keys found in the settings JSON (a profile from
 * before encryption, or one edited by an older version) are written to
 * secrets.bin, read back to verify, and only then removed from the JSON and
 * its backup. Any failure leaves the keys where they were.
 * @param {import('./secrets').EncryptionBackend} backend
 */
async function initSecureStorage(backend) {
  load();
  secretsFile = createSecretsFile(() => app.getPath('userData'), backend);
  let available = false;
  try {
    available = await backend.isAvailable();
  } catch (_) {
    available = false;
  }
  if (!available) {
    keyMode = 'unavailable';
    return keyStorageStatus();
  }
  const protectedMode = backend.isWeak() ? 'weak' : 'encrypted';

  let stored = null;
  let unreadable = false;
  try {
    stored = await secretsFile.read();
  } catch (e) {
    console.error('[onscreenly] could not decrypt saved API keys:', e && e.message);
    unreadable = true;
  }
  // A key still in the JSON is newer than secrets.bin: only an older version
  // of the app, which does not know about secrets.bin, writes keys there.
  const fromJson = nonEmptyKeys(data.apiKeys);
  const merged = { ...(stored || {}), ...fromJson };
  data.apiKeys = { ...data.apiKeys, ...merged };

  if (Object.keys(fromJson).length) {
    try {
      await secretsFile.write(merged);
      const check = await secretsFile.read();
      if (JSON.stringify(check) !== JSON.stringify(merged)) throw new Error('encrypted keys did not read back');
      lastWrittenKeys = JSON.stringify(merged);
      keyMode = protectedMode;
    } catch (e) {
      console.error('[onscreenly] keeping API keys in the settings file:', e && e.message);
      keyMode = 'unavailable';
      return keyStorageStatus();
    }
  } else {
    keyMode = unreadable ? 'unreadable' : protectedMode;
    lastWrittenKeys = stored ? JSON.stringify(stored) : null;
  }

  if (Object.keys(fromJson).length || backupHasPlaintextKeys()) {
    // Saving twice: the first write moves the old plaintext file to .bak, the
    // second replaces that backup with the key-free copy.
    save();
    save();
  }
  return keyStorageStatus();
}

function keyStorageStatus() {
  return describeKeyStorage(keyMode, process.platform);
}

/** Resolves once any pending encrypted-key write has finished. */
function flushSecrets() {
  return secretsWrite.catch(() => {});
}

/** Null when the API keys on disk match the ones in memory; the Error of the last failed write otherwise. */
function secretsSaveError() {
  return secretsError;
}

/** Removes the settings file, its backup and the encrypted keys. */
async function deleteLocalSettings() {
  await flushSecrets();
  for (const target of [fileStore.mainPath(), fileStore.bakPath(), fileStore.tmpPath()]) {
    try {
      fs.unlinkSync(target);
    } catch (e) {
      if (!(e && e.code === 'ENOENT')) throw e;
    }
  }
  if (secretsFile) secretsFile.remove();
  data = null;
  lastWrittenKeys = null;
  secretsError = null;
}

function deepMerge(base, over) {
  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const k of Object.keys(over || {})) {
    if (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) && typeof base[k] === 'object') {
      out[k] = deepMerge(base[k], over[k]);
    } else if (isPlainObject(base[k]) && !isPlainObject(over[k])) {
      // A block of settings replaced by null, a string or a list (a hand-edited or damaged file)
      // keeps its defaults; "publik": null used to stop the app from launching.
      continue;
    } else {
      if (k === 'aiRules' && typeof over[k] === 'string') {
        out[k] = over[k].slice(0, MAX_AI_RULES_CHARS);
      } else {
        out[k] = over[k];
      }
    }
  }
  return out;
}

function load() {
  if (data) return data;
  const loaded = fileStore.load();
  data = deepMerge(DEFAULTS, loaded && loaded.data ? loaded.data : {});
  // Keep a damaged file for inspection instead of letting the next save copy it over the backup.
  if (loaded && loaded.mainCorrupt) fileStore.quarantineMain();
  if (loaded && loaded.recoveredFromBackup) save(); // best-effort heal so the corruption doesn't linger
  return data;
}

// Atomic temp+rename with a .bak snapshot and 0600 permissions — see
// settings-store-core.js. Unlike the old bare writeFileSync, this never
// swallows a failure: lastSaveError() lets a caller (e.g. the settings:set
// IPC handler) surface it instead of pretending the save succeeded.
function save() {
  try {
    fileStore.persist(persistable(data));
    if (keysLiveInSecretsFile()) queueSecretsWrite();
    lastError = null;
    return true;
  } catch (e) {
    lastError = e;
    console.error('[onscreenly] failed to save settings:', e && e.message);
    return false;
  }
}

// Called by the main process at launch, before the window exists. publik becomes the
// selected provider only where nothing works today: a build that carries an
// app token, a settings file that has never been switched automatically, and
// no key typed into the currently selected provider. A user who has ever
// pasted a key keeps exactly what they had.
function applyPublikDefault(build) {
  load();
  if (!build || !build.available || data.publik.defaultApplied) return false;
  const current = data.provider;
  const hasOwnKey = !!(data.apiKeys && data.apiKeys[current]);
  const hasCustomEndpoint = current === 'custom' && !!data.baseUrl;
  data.publik = { ...data.publik, defaultApplied: true };
  if (hasOwnKey || hasCustomEndpoint) {
    save();
    return false;
  }
  data.provider = 'publik';
  save();
  return true;
}

function stripRendererPatch(patch) {
  const out = sanitizeLike({ ...DEFAULTS, ...RENDERER_EXTRA_FIELDS }, patch) || {};
  for (const k of RENDERER_READ_ONLY) delete out[k];
  // The vault folder and the on/off switch have their own IPC channels
  // (knowledge:pick-vault, knowledge:set-enabled), so a Save made while a
  // folder is being picked cannot undo the choice.
  if (out.knowledge && typeof out.knowledge === 'object') {
    out.knowledge = { ...out.knowledge };
    delete out.knowledge.vaultPath;
    delete out.knowledge.enabled;
  }
  if (out.apiKeys && typeof out.apiKeys === 'object') {
    out.apiKeys = { ...out.apiKeys };
    delete out.apiKeys.publik;
    // A masked key sent back unchanged means "keep the saved key".
    const saved = (load() && data.apiKeys) || {};
    for (const [name, value] of Object.entries(out.apiKeys)) {
      if (saved[name] && !UNMASKED_KEYS.has(name) && value === maskKey(saved[name])) delete out.apiKeys[name];
    }
  }
  return out;
}

// What the renderer gets from settings:get: saved keys only as a mask (the
// last four characters), and never the publik key.
function redactForRenderer(s) {
  const apiKeys = {};
  for (const [name, value] of Object.entries(s.apiKeys || {})) {
    apiKeys[name] = UNMASKED_KEYS.has(name) ? value : maskKey(value);
  }
  apiKeys.publik = '';
  return {
    ...s,
    apiKeys,
    publik: { ...(s.publik || {}), connected: !!(s.apiKeys && s.apiKeys.publik) }
  };
}

module.exports = {
  MAX_AI_RULES_CHARS,
  MIN_OPACITY,
  MAX_OPACITY,
  clampOpacity,
  RENDERER_READ_ONLY,
  applyPublikDefault,
  stripRendererPatch,
  redactForRenderer,
  initSecureStorage,
  keyStorageStatus,
  flushSecrets,
  secretsSaveError,
  deleteLocalSettings,
  getSettings() {
    return load();
  },
  /** Null when the last save succeeded; the Error otherwise. */
  lastSaveError() {
    return lastError;
  },
  // Main-process only: the provisioning flow writes the key and its state here.
  setPublik(patch) {
    load();
    const { apiKey, ...rest } = patch || {};
    if (typeof apiKey === 'string') data.apiKeys = { ...data.apiKeys, publik: apiKey };
    data.publik = { ...data.publik, ...rest };
    save();
    return data;
  },
  setSettings(patch) {
    load();
    const nextSettings = deepMerge(data, patch || {});
    nextSettings.baseUrl = normalizeBaseUrl(nextSettings.baseUrl);
    nextSettings.opacity = clampOpacity(nextSettings.opacity);
    nextSettings.knowledge = normalizeKnowledge(nextSettings.knowledge);
    data = nextSettings;
    save();
    return data;
  },
  // Per-caller consent for the app-link get_slides action — separate from the
  // link's own read/action scope grants (see src/applink.js). 'granted',
  // 'denied', or undefined if the caller has never been asked.
  getSlidesConsent(callerId) {
    load();
    return ((data.applinkSlidesConsentByApp || {})[APP_ID] || {})[callerId];
  },
  setSlidesConsent(callerId, decision) {
    load();
    const byApp = data.applinkSlidesConsentByApp || {};
    const decisions = { ...(byApp[APP_ID] || {}), [callerId]: decision };
    data.applinkSlidesConsentByApp = { ...byApp, [APP_ID]: decisions };
    save();
    return decisions;
  },
  clearSlidesConsent(callerId) {
    load();
    const byApp = data.applinkSlidesConsentByApp || {};
    if (!byApp[APP_ID] || !(callerId in byApp[APP_ID])) return;
    const next = { ...byApp[APP_ID] };
    delete next[callerId];
    data.applinkSlidesConsentByApp = { ...byApp, [APP_ID]: next };
    save();
  }
};
