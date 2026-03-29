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

  // ── Moonlight ──
  moonlightDetect: () => ipcRenderer.invoke('moonlight-detect'),
  moonlightStatus: () => ipcRenderer.invoke('moonlight-status'),
  moonlightStream: (hostIp: string, appName?: string) =>
    ipcRenderer.invoke('moonlight-stream', { hostIp, appName }),
  moonlightStop: () => ipcRenderer.invoke('moonlight-stop'),
  moonlightPair: (hostIp: string) => ipcRenderer.invoke('moonlight-pair', hostIp),
  moonlightPairPin: (pin: string) => ipcRenderer.invoke('moonlight-pair-pin', pin),
  moonlightListApps: (hostIp: string) => ipcRenderer.invoke('moonlight-list-apps', hostIp),

  onMoonlightProcessExit: (callback: (code: number | null) => void) => {
    ipcRenderer.on('moonlight-process-exit', (_event, code) => callback(code));
  },
  onMoonlightNeedsPair: (callback: () => void) => {
    ipcRenderer.on('moonlight-needs-pair', () => callback());
  },
  onMoonlightPairPrompt: (callback: () => void) => {
    ipcRenderer.on('moonlight-pair-prompt', () => callback());
  },
  onMoonlightPairResult: (callback: (result: { success: boolean; error?: string }) => void) => {
    ipcRenderer.on('moonlight-pair-result', (_event, result) => callback(result));
  },
  removeMoonlightListeners: () => {
    ipcRenderer.removeAllListeners('moonlight-process-exit');
    ipcRenderer.removeAllListeners('moonlight-needs-pair');
    ipcRenderer.removeAllListeners('moonlight-pair-prompt');
    ipcRenderer.removeAllListeners('moonlight-pair-result');
  },
});
