import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { HostPeer } from './peer';
import { startSignalingServer, stopSignalingServer, getLocalIPs } from './signaling';
import { SunshineManager } from './sunshine';

let mainWindow: BrowserWindow | null = null;
let peer: HostPeer | null = null;
const sunshine = new SunshineManager();
let signalingPort = 3001;
let signalingIPs: string[] = [];

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 620,
    resizable: true,
    minWidth: 700,
    minHeight: 500,
    title: 'InputShare Host',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);

  // Start embedded signaling server BEFORE loading the page
  try {
    const result = await startSignalingServer(signalingPort);
    signalingPort = result.port;
    signalingIPs = result.ips;
    console.log(`Signaling server started on port ${signalingPort}`);
  } catch (e: any) {
    console.warn('Failed to start signaling server:', e.message);
  }

  mainWindow.loadFile(path.join(__dirname, '..', '..', 'ui', 'apps', 'host', 'ui', 'index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  peer?.stop();
  sunshine.destroy();
  stopSignalingServer();
  app.quit();
});

// ── IPC handlers ────────────────────────────────────────────────

ipcMain.handle('start-host', async (_event, { signalingUrl, roomId, devices }) => {
  if (peer) peer.stop();

  peer = new HostPeer({
    signalingUrl,
    roomId,
    window: mainWindow!,
    devices: devices ?? { kb: true, gp: true },
    onStatus: (status: string) => {
      mainWindow?.webContents.send('status-update', status);
    },
    onClientConnected: () => {
      mainWindow?.webContents.send('status-update', 'Client connected — injecting input');
    },
    onClientDisconnected: () => {
      mainWindow?.webContents.send('status-update', 'Client disconnected');
    },
    onGamepadStatus: (available: boolean, error: string | null) => {
      mainWindow?.webContents.send('gamepad-status', { available, error });
    },
    onLatencyUpdate: (stats: { processingUs: number }) => {
      mainWindow?.webContents.send('latency-update', stats);
    },
  });

  await peer.start();
  return { ok: true, roomId };
});

ipcMain.handle('stop-host', () => {
  peer?.stop();
  peer = null;
  return { ok: true };
});

ipcMain.handle('get-status', () => {
  return {
    connected: peer?.isConnected() ?? false,
    gamepad: {
      available: peer?.isGamepadAvailable() ?? false,
      error: peer?.getGamepadError() ?? null,
      controllers: peer?.getGamepadControllerCount() ?? 0,
    },
  };
});

ipcMain.handle('get-signaling-info', () => {
  return {
    port: signalingPort,
    ips: signalingIPs,
    localUrl: `ws://localhost:${signalingPort}/ws`,
    lanUrls: signalingIPs.map(ip => `ws://${ip}:${signalingPort}/ws`),
  };
});

// ── Sunshine IPC handlers ───────────────────────────────────────

ipcMain.handle('sunshine-detect', () => sunshine.detect());
ipcMain.handle('sunshine-status', () => sunshine.quickStatus());
ipcMain.handle('sunshine-open-webui', () => { sunshine.openWebUI(); return { ok: true }; });
ipcMain.handle('sunshine-start-service', () => ({ ok: sunshine.startService() }));
ipcMain.handle('sunshine-stop-service', () => ({ ok: sunshine.stopService() }));
