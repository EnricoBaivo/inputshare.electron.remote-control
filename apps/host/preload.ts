import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  startHost: (signalingUrl: string, roomId: string, devices?: { kb: boolean; gp: boolean }) =>
    ipcRenderer.invoke('start-host', { signalingUrl, roomId, devices }),

  stopHost: () =>
    ipcRenderer.invoke('stop-host'),

  getStatus: () =>
    ipcRenderer.invoke('get-status'),

  getSignalingInfo: () =>
    ipcRenderer.invoke('get-signaling-info'),

  onStatusUpdate: (callback: (status: string) => void) => {
    ipcRenderer.on('status-update', (_event, status) => callback(status));
  },

  onGamepadStatus: (callback: (info: { available: boolean; error: string | null }) => void) => {
    ipcRenderer.on('gamepad-status', (_event, info) => callback(info));
  },

  onLatencyUpdate: (callback: (stats: { processingUs: number }) => void) => {
    ipcRenderer.on('latency-update', (_event, stats) => callback(stats));
  },

  // WebRTC bridge: renderer handles WebRTC, sends input to main for injection
  sendInput: (data: ArrayBuffer) =>
    ipcRenderer.invoke('host-input', data),

  reportPeerStatus: (status: string) =>
    ipcRenderer.invoke('host-peer-status', status),

  onStartWebRTC: (callback: (config: { signalingUrl: string; roomId: string }) => void) => {
    ipcRenderer.on('start-webrtc', (_event, config) => callback(config));
  },

  onStopWebRTC: (callback: () => void) => {
    ipcRenderer.on('stop-webrtc', () => callback());
  },

  onInputViz: (callback: (data: any) => void) => {
    ipcRenderer.on('input-viz', (_event, data) => callback(data));
  },

  // ── Sunshine ──
  sunshineDetect: () => ipcRenderer.invoke('sunshine-detect'),
  sunshineStatus: () => ipcRenderer.invoke('sunshine-status'),
  sunshineOpenWebUI: () => ipcRenderer.invoke('sunshine-open-webui'),
  sunshineStartService: () => ipcRenderer.invoke('sunshine-start-service'),
  sunshineStopService: () => ipcRenderer.invoke('sunshine-stop-service'),
});
