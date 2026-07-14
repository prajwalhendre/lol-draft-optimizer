'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('draftApi', {
  getBootstrap: () => ipcRenderer.invoke('get-bootstrap'),
  onStatus: (cb) => ipcRenderer.on('status', (_e, p) => cb(p)),
  onDraft: (cb) => ipcRenderer.on('draft', (_e, p) => cb(p)),
  onDraftEnd: (cb) => ipcRenderer.on('draft-end', (_e, p) => cb(p)),
  onInteractive: (cb) => ipcRenderer.on('interactive', (_e, p) => cb(p)),
});
