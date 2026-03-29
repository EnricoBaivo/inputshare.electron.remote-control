import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  getStatus: () =>
    ipcRenderer.invoke('get-status'),

  onStatusUpdate: (callback: (status: string) => void) => {
    ipcRenderer.on('status-update', (_event, status) => callback(status));
  },

  // ── Global capture controls ──
  startGlobalCapture: (devices: { kb: boolean; gp: boolean }) =>
    ipcRenderer.invoke('gc-start', devices),

  stopGlobalCapture: () =>
    ipcRenderer.invoke('gc-stop'),

  // ── Global capture event listeners ──
  onGcKey: (callback: (data: { vk: number; scan: number; down: boolean }) => void) => {
    ipcRenderer.on('gc-key', (_event, data) => callback(data));
  },

  onGcMouseMove: (callback: (data: { dx: number; dy: number }) => void) => {
    ipcRenderer.on('gc-mouse-move', (_event, data) => callback(data));
  },

  onGcMouseBtn: (callback: (data: { button: number; down: boolean }) => void) => {
    ipcRenderer.on('gc-mouse-btn', (_event, data) => callback(data));
  },

  onGcGamepad: (callback: (data: { index: number; buttons: number; axes: number[]; triggers: number[] }) => void) => {
    ipcRenderer.on('gc-gamepad', (_event, data) => callback(data));
  },

  onGcStopped: (callback: () => void) => {
    ipcRenderer.on('gc-stopped', () => callback());
  },

  removeGcListeners: () => {
    ipcRenderer.removeAllListeners('gc-key');
    ipcRenderer.removeAllListeners('gc-mouse-move');
    ipcRenderer.removeAllListeners('gc-mouse-btn');
    ipcRenderer.removeAllListeners('gc-gamepad');
    ipcRenderer.removeAllListeners('gc-stopped');
  },
});
