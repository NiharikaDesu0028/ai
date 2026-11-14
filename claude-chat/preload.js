/**
 * preload.js  —  Electron preload script
 * Runs in an isolated context before the renderer page loads.
 * Exposes a safe, whitelisted API bridge via contextBridge.
 */

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Get app/platform info from main process
  getAppInfo: () => ipcRenderer.invoke('app-info'),

  // Platform string for conditional UI rendering
  platform: process.platform,

  // Electron version info
  versions: {
    electron: process.versions.electron,
    node:     process.versions.node,
    chrome:   process.versions.chrome,
  },
});
