'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('waifuxWindow', {
  close: () => ipcRenderer.send('window-action', 'close'),
  minimize: () => ipcRenderer.send('window-action', 'minimize'),
  maximize: () => ipcRenderer.send('window-action', 'maximize'),
});
