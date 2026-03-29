import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { GlobalCapture } from './global-capture';

let mainWindow: BrowserWindow | null = null;
let globalCapture: GlobalCapture | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    title: 'InputShare Client',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Vite outputs processed HTML to dist/ui/; __dirname is dist/apps/client/ at runtime
  mainWindow.loadFile(path.join(__dirname, '..', '..', 'ui', 'apps', 'client', 'ui', 'index.html'));
  mainWindow.setMenuBarVisibility(false);

  // Initialize global capture (loads koffi bindings)
  globalCapture = new GlobalCapture({ window: mainWindow });
  globalCapture.init();
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  globalCapture?.destroy();
  app.quit();
});

// ── IPC handlers ────────────────────────────────────────────────

ipcMain.handle('get-status', () => {
  return { ok: true };
});

ipcMain.handle('gc-start', (_event, devices: { kb: boolean; gp: boolean }) => {
  if (!globalCapture) return { ok: false, error: 'Not initialized' };
  globalCapture.start(devices);
  return { ok: true };
});

ipcMain.handle('gc-stop', () => {
  globalCapture?.stop();
  return { ok: true };
});
