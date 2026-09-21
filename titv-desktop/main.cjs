const { app, BrowserWindow, shell, dialog } = require('electron');
const path = require('node:path');
const { autoUpdater } = require('electron-updater');

const APP_NAME = 'TITV 工程部製播排班系統';
const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

let mainWindow = null;
let updatePromptVisible = false;

app.setName(APP_NAME);
app.setAppUserModelId('tw.org.titv.engineering.scheduler');

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

  mainWindow = win;
  win.loadFile(path.join(__dirname, 'app', 'index.html'));

  win.once('ready-to-show', () => {
    win.show();
    if (win.isMaximizable()) win.maximize();
  });

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
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

function configureAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;

  autoUpdater.on('checking-for-update', () => {
    console.log('[Updater] checking for update');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[Updater] update available:', info.version);
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setProgressBar(2);
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('[Updater] already current:', info.version);
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setProgressBar(-1);
  });

  autoUpdater.on('download-progress', (progress) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const value = Math.max(0, Math.min(1, progress.percent / 100));
      mainWindow.setProgressBar(value);
    }
  });

  autoUpdater.on('update-downloaded', async (info) => {
    console.log('[Updater] update downloaded:', info.version);
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setProgressBar(-1);
    if (updatePromptVisible) return;

    updatePromptVisible = true;
    try {
      const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
      const result = await dialog.showMessageBox(parent, {
        type: 'info',
        title: '軟體更新已準備完成',
        message: `TITV 工程部製播排班系統 ${info.version} 已下載完成`,
        detail: '重新啟動軟體後會自動完成更新。若目前正在排班，可選擇稍後，關閉軟體時也會自動安裝。',
        buttons: ['立即重新啟動並更新', '稍後'],
        defaultId: 0,
        cancelId: 1,
        noLink: true
      });

      if (result.response === 0) {
        autoUpdater.quitAndInstall(false, true);
      }
    } finally {
      updatePromptVisible = false;
    }
  });

  autoUpdater.on('error', (error) => {
    console.error('[Updater] error:', error);
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setProgressBar(-1);
  });
}

async function checkForUpdates() {
  if (!app.isPackaged) return;
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    console.error('[Updater] check failed:', error);
  }
}

app.whenReady().then(() => {
  createWindow();
  configureAutoUpdater();

  if (app.isPackaged) {
    setTimeout(checkForUpdates, 5000);
    setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL_MS);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
