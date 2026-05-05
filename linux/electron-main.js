'use strict';

const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');
const { startServer, DEFAULT_PORT } = require('./waifux-linux');

let mainWindow = null;
let serverHandle = null;

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1800,
    height: 1060,
    minWidth: 1100,
    minHeight: 720,
    title: process.env.WAIFUX_INITIAL_TAB === 'wallpaper' ? 'WaifuX 测试-壁纸页' : 'WaifuX',
    backgroundColor: '#0b0b0d',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 16, y: 18 },
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    shell.openExternal(targetUrl);
    return { action: 'deny' };
  });

  const initialTab = process.env.WAIFUX_INITIAL_TAB ? `?tab=${encodeURIComponent(process.env.WAIFUX_INITIAL_TAB)}` : '';
  mainWindow.loadURL(`${url}${initialTab}`);
  if (process.env.WAIFUX_INITIAL_TAB === 'wallpaper') {
    mainWindow.webContents.on('did-finish-load', () => {
      mainWindow.setTitle('WaifuX 测试-壁纸页');
      mainWindow.webContents.executeJavaScript(`
        document.title = 'WaifuX 测试-壁纸页';
        document.querySelector('[data-tab="wallpaper"]')?.click();
      `).catch(() => {});
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  serverHandle = await startServer({
    port: Number(process.env.WAIFUX_PORT) || DEFAULT_PORT,
    open: false,
  });
  createWindow(serverHandle.url);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && serverHandle) {
      createWindow(serverHandle.url);
    }
  });
}).catch((error) => {
  console.error(error.stack || error.message);
  app.quit();
});

ipcMain.on('window-action', (event, action) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  if (action === 'close') win.close();
  if (action === 'minimize') win.minimize();
  if (action === 'maximize') {
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (serverHandle?.server) {
    serverHandle.server.close();
    serverHandle = null;
  }
});
