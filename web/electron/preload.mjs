// ============================================================================
// electron/preload.mjs — GateStack Preload Script
// ============================================================================
// Safely exposes Electron IPC to the renderer process.
// The renderer can listen for menu commands via window.electronAPI.
// ============================================================================
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Listen for menu commands from main process
  onMenuCommand: (callback) => {
    const channels = ['menu:step', 'menu:run', 'menu:pause', 'menu:reset'];
    channels.forEach(channel => {
      ipcRenderer.on(channel, () => callback(channel.replace('menu:', '')));
    });
  },

  // App info
  getVersion: () => '0.1.0',
  isElectron: true,
});
