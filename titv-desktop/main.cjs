const { app, BrowserWindow, shell } = require('electron');
const path = require('node:path');

const APP_NAME = 'TITV 工程部製播排班系統';

app.setName(APP_NAME);

function createWindow() {
  const win = new BrowserWindow({
    title: APP_NAME,
    icon: path.join(__dirname, 'app', 'android-chrome-192x192.png'),
    width: 1680,
    height: 1030,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: '#f4f1ea',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: false,
      spellcheck: false
    }
  });

  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  win.once('ready-to-show', () => {
    win.show();
    if (win.isMaximizable()) win.maximize();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url) || /^mailto:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url) || /^mailto:/i.test(url)) shell.openExternal(url);
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
