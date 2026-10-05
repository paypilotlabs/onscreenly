// Every IPC channel is registered through handle()/on() here, so each message
// is checked to come from the top frame of one of Onscreenly's own pages before
// any handler runs. Payload checks live with each handler (see ipc-policy.js).
const { ipcMain } = require('electron');
const { RENDERER_DIR } = require('./platform');
const { isTrustedPageUrl } = require('./ipc-policy');

function isTrustedSender(event) {
  const frame = event.senderFrame;
  // A frame that navigated away or was destroyed has no senderFrame; subframes
  // (there are none in Onscreenly's pages) never get main-process access.
  if (!frame || frame.parent) return false;
  return isTrustedPageUrl(frame.url, RENDERER_DIR);
}

function reject(channel, event) {
  const url = event.senderFrame ? event.senderFrame.url : '(no frame)';
  console.warn(`[ipc] refused ${channel} from an untrusted sender: ${url}`);
}

function handle(channel, listener) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrustedSender(event)) {
      reject(channel, event);
      throw new Error('Refused: untrusted sender');
    }
    return listener(event, ...args);
  });
}

function on(channel, listener) {
  ipcMain.on(channel, (event, ...args) => {
    if (!isTrustedSender(event)) {
      reject(channel, event);
      return;
    }
    listener(event, ...args);
  });
}

module.exports = { handle, on, isTrustedSender };
