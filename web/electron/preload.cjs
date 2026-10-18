// ============================================================================
// electron/preload.cjs — GateStack Preload Script
// ============================================================================
// Safely exposes Electron IPC to the renderer process.
//
// onMenuCommand(callback) registers one listener per menu channel and returns
// a function that removes them again. The renderer registers once (from a
// React effect) and calls the returned function on unmount, so a menu key
// press is delivered exactly once.
// ============================================================================
const { contextBridge, ipcRenderer } = require('electron');

const MENU_CHANNELS = [
  'menu:step', 'menu:stepback', 'menu:run', 'menu:pause',
  'menu:reset', 'menu:wipe', 'menu:help', 'menu:about',
];

contextBridge.exposeInMainWorld('electronAPI', {
  onMenuCommand: (callback) => {
    const listeners = MENU_CHANNELS.map((channel) => {
      const listener = () => callback(channel.slice('menu:'.length));
      ipcRenderer.on(channel, listener);
      return [channel, listener];
    });
    return () => {
      for (const [channel, listener] of listeners) ipcRenderer.removeListener(channel, listener);
    };
  },
  // Runtime versions for the in-app About dialog. The app version itself comes
  // from package.json, which the renderer bundles.
  getVersions: () => ({
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  }),
  isElectron: true,
});
