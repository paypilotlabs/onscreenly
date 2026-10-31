const { contextBridge, ipcRenderer } = require('electron');
const platform = process.platform;

const api = {
  platform,
  settingsGet: () => ipcRenderer.invoke('settings:get'),
  settingsSet: (patch) => ipcRenderer.invoke('settings:set', patch),
  whisperModels: () => ipcRenderer.invoke('whisper:models'),
  whisperModelDownload: (modelId) => ipcRenderer.invoke('whisper:model-download', modelId),
  whisperModelCancel: (modelId) => ipcRenderer.invoke('whisper:model-cancel', modelId),
  whisperModelDelete: (modelId) => ipcRenderer.invoke('whisper:model-delete', modelId),
  whisperModelImport: (modelId) => ipcRenderer.invoke('whisper:model-import', modelId),
  platformInfo: () => ipcRenderer.invoke('platform:info'),
  ask: (payload) => ipcRenderer.send('ask', payload),
  cancelAnswer: () => ipcRenderer.send('llm:cancel'),
  captureToggle: () =>
    ipcRenderer.invoke('capture:toggle').catch((err) => {
      console.error('[onscreenly] captureToggle error', err);
      return false;
    }),
  captureState: () => ipcRenderer.invoke('capture:state'),
  micPcm: (arrayBuffer) => ipcRenderer.send('mic:pcm', arrayBuffer),
  systemPcm: (arrayBuffer) => ipcRenderer.send('system:pcm', arrayBuffer),
  setIgnoreMouse: (v) => ipcRenderer.send('mouse:ignore', v),
  windowDragStart: () => ipcRenderer.send('window:drag-start'),
  windowDragEnd: () => ipcRenderer.send('window:drag-end'),
  clearTranscript: () => ipcRenderer.invoke('transcript:clear'),
  slidesList: () => ipcRenderer.invoke('slides:list'),
  slidesState: () => ipcRenderer.invoke('slides:state'),
  slidesClear: () => ipcRenderer.invoke('slides:clear'),
  openPane: (url) => ipcRenderer.send('open-pane', url),
  publikState: () => ipcRenderer.invoke('publik:state'),
  publikAcceptDisclosure: () => ipcRenderer.invoke('publik:accept-disclosure'),
  publikReconnect: () => ipcRenderer.invoke('publik:reconnect'),
  publikRefresh: () => ipcRenderer.invoke('publik:refresh'),
  publikDisconnect: () => ipcRenderer.invoke('publik:disconnect'),
  publikCardSeen: () => ipcRenderer.invoke('publik:card-seen'),
  publikOpen: (url) => ipcRenderer.send('publik:open', url),
  appLinkState: () => ipcRenderer.invoke('applink:state'),
  appLinkRevoke: (callerId) => ipcRenderer.invoke('applink:revoke', callerId),
  appLinkConsentRespond: (id, allowed) => ipcRenderer.send('applink:consent-response', { id, allowed }),
  pickProfileDocument: () => ipcRenderer.invoke('profile:pickDocument'),
  knowledgeStatus: () => ipcRenderer.invoke('knowledge:status'),
  knowledgePickVault: () => ipcRenderer.invoke('knowledge:pick-vault'),
  knowledgeForgetVault: () => ipcRenderer.invoke('knowledge:forget-vault'),
  knowledgeSetEnabled: (enabled) => ipcRenderer.invoke('knowledge:set-enabled', enabled),
  knowledgeReindex: () => ipcRenderer.invoke('knowledge:reindex'),
  knowledgeSearch: (query) => ipcRenderer.invoke('knowledge:search', query),
  knowledgeOpenNote: (relPath) => ipcRenderer.invoke('knowledge:open-note', relPath),
  copyAnswer: (text) => ipcRenderer.invoke('answer:copy', text),
  saveAnswerMarkdown: (text, kind) => ipcRenderer.invoke('answer:save-markdown', { text, kind }),
  keyStorageStatus: () => ipcRenderer.invoke('data:key-storage'),
  deleteAllData: () => ipcRenderer.invoke('data:delete-all'),
  meetingsInfo: () => ipcRenderer.invoke('meetings:info'),
  shortcutsGet: () => ipcRenderer.invoke('shortcuts:get'),
  shortcutsSet: (request) => ipcRenderer.invoke('shortcuts:set', request),
  meetingsSetRetention: (keep) => ipcRenderer.invoke('meetings:set-retention', keep),
  meetingsDeleteHistory: () => ipcRenderer.invoke('meetings:delete-history'),
  meetingsArchiveOversized: () => ipcRenderer.invoke('meetings:archive-oversized'),
  quit: () => ipcRenderer.send('app:quit'),
  permissionsCheck: () => ipcRenderer.invoke('permissions:check'),
  permissionsRequest: () => ipcRenderer.invoke('permissions:request'),
  permissionsContinue: () => ipcRenderer.send('permissions:continue'),
  log: (msg) => ipcRenderer.send('log', msg),
  on: (channel, cb) => {
    const allowed = [
      'capture:state',
      'shortcuts:changed',
      'llm:start',
      'llm:token',
      'llm:done',
      'llm:error',
      'status',
      'transcript',
      'transcript:restore',
      'stt:interim',
      'stt:final',
      'stt:status',
      'vad:state',
      'applink:consent-request',
      'hide:toggle',
      'session:toggle',
      'whisper:download-progress',
      'whisper:models-changed',
      'publik:state',
      'slides:update',
      'knowledge:status'
    ];
    if (!allowed.includes(channel)) return;
    ipcRenderer.on(channel, (_e, data) => cb(data));
  }
};

contextBridge.exposeInMainWorld('onscreenly', api);
// Deprecated compatibility alias for integrations using the original preload API.
contextBridge.exposeInMainWorld('cue', api);
