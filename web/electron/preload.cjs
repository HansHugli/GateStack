// ============================================================================
// electron/preload.mjs — GateStack Preload Script
// ============================================================================
// Safely exposes Electron IPC to the renderer process.
// ============================================================================
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onMenuCommand: (callback) => {
    const channels = ['menu:step', 'menu:run', 'menu:pause', 'menu:reset'];
    channels.forEach(channel => {
      ipcRenderer.on(channel, () => callback(channel.replace('menu:', '')));
    });
  },
  getVersion: () => '0.2.0',
  isElectron: true,
});
