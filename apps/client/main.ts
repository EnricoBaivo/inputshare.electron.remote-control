import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { GlobalCapture } from './global-capture';
import { MoonlightManager } from './moonlight';

let mainWindow: BrowserWindow | null = null;
let globalCapture: GlobalCapture | null = null;
let moonlight: MoonlightManager | null = null;

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

  // Initialize Moonlight manager
  moonlight = new MoonlightManager(mainWindow);
  moonlight.detect();
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  globalCapture?.destroy();
  moonlight?.destroy();
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

// ── Moonlight IPC handlers ──────────────────────────────────────

ipcMain.handle('moonlight-detect', () => {
  return moonlight?.detect() ?? { installed: false, exePath: null, running: false };
});

ipcMain.handle('moonlight-status', () => {
  return moonlight?.status ?? { installed: false, exePath: null, running: false };
});

ipcMain.handle('moonlight-stream', (_event, { hostIp, appName }) => {
  return { ok: moonlight?.stream(hostIp, appName) ?? false };
});

ipcMain.handle('moonlight-stop', () => {
  moonlight?.stop();
  return { ok: true };
});

ipcMain.handle('moonlight-pair', (_event, hostIp: string) => {
  moonlight?.pair(hostIp);
  return { ok: true };
});

ipcMain.handle('moonlight-pair-pin', (_event, pin: string) => {
  moonlight?.sendPairPin(pin);
  return { ok: true };
});

ipcMain.handle('moonlight-list-apps', async (_event, hostIp: string) => {
  return moonlight?.listApps(hostIp) ?? [];
});
