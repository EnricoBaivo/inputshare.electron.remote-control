// Host-side peer — main process handles input injection,
// renderer handles WebRTC (browser-native RTCPeerConnection).
// Communication between renderer↔main via Electron IPC.

import { decode, PacketType, encodePong } from '../../packages/shared/index';
import type { Packet, AllowedDevices } from '../../packages/shared/index';
import { WindowsInjector } from './injector';
import { GamepadInjector } from './gamepad';
import { ipcMain, type BrowserWindow } from 'electron';

export interface HostPeerOptions {
  signalingUrl: string;
  roomId: string;
  window: BrowserWindow;
  devices?: AllowedDevices;
  onStatus?: (status: string) => void;
  onClientConnected?: () => void;
  onClientDisconnected?: () => void;
  onGamepadStatus?: (available: boolean, error: string | null) => void;
  onLatencyUpdate?: (stats: { processingUs: number }) => void;
}

export class HostPeer {
  private injector = new WindowsInjector();
  private gamepad = new GamepadInjector();
  private opts: HostPeerOptions;
  private connected = false;
  private lastProcessingUs = 0;
  private heldKeys = new Map<number, number>(); // vk -> scanCode
  private devices: AllowedDevices;

  constructor(opts: HostPeerOptions) {
    this.opts = opts;
    this.devices = opts.devices ?? { kb: true, gp: true };
  }

  async start(): Promise<void> {
    // Init gamepad (optional)
    const gamepadOk = await this.gamepad.init();
    this.opts.onGamepadStatus?.(gamepadOk, this.gamepad.initError);

    // Register IPC handler for binary input data from renderer
    ipcMain.removeHandler('host-input');
    ipcMain.handle('host-input', (_event, data: ArrayBuffer) => {
      return this.handleInput(data);
    });

    // Register IPC handler for connection status from renderer
    ipcMain.removeHandler('host-peer-status');
    ipcMain.handle('host-peer-status', (_event, status: string) => {
      if (status === 'connected') {
        this.connected = true;
        this.opts.onClientConnected?.();
        this.opts.onStatus?.('Client connected — injecting input');
      } else if (status === 'disconnected') {
        this.releaseAllKeys();
        this.connected = false;
        this.opts.onClientDisconnected?.();
        this.opts.onStatus?.('Client disconnected');
      } else {
        this.opts.onStatus?.(status);
      }
    });

    // Tell the renderer to start WebRTC hosting
    this.opts.onStatus?.('Connecting to signaling server...');
    this.opts.window.webContents.send('start-webrtc', {
      signalingUrl: this.opts.signalingUrl,
      roomId: this.opts.roomId,
    });
  }

  private handleInput(data: ArrayBuffer): ArrayBuffer | null {
    // Electron IPC converts ArrayBuffer to Node.js Buffer when crossing
    // the process boundary. Buffer may have a non-zero byteOffset into
    // a shared pool ArrayBuffer — extract a clean copy so DataView reads
    // from the correct position.
    let buf: ArrayBuffer;
    if (Buffer.isBuffer(data)) {
      const b = data as unknown as Buffer;
      buf = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    } else {
      buf = data;
    }
    let packet: Packet;
    try {
      packet = decode(buf);
    } catch {
      return null;
    }

    const before = performance.now();
    let vizData: any = null;

    switch (packet.type) {
      case PacketType.MOUSE_MOVE:
        if (!this.devices.kb) break;
        this.injector.moveMouse(packet.dx, packet.dy);
        vizData = { t: 'mm', dx: packet.dx, dy: packet.dy };
        break;
      case PacketType.MOUSE_BTN:
        if (!this.devices.kb) break;
        this.injector.mouseButton(packet.button, packet.down);
        vizData = { t: 'mb', btn: packet.button, down: packet.down };
        break;
      case PacketType.MOUSE_WHEEL:
        if (!this.devices.kb) break;
        this.injector.mouseWheel(packet.delta);
        vizData = { t: 'mw', delta: packet.delta };
        break;
      case PacketType.KEY:
        if (!this.devices.kb) break;
        this.injector.keyPress(packet.vk, packet.scanCode, packet.down);
        if (packet.down) {
          this.heldKeys.set(packet.vk, packet.scanCode);
        } else {
          this.heldKeys.delete(packet.vk);
        }
        vizData = { t: 'k', vk: packet.vk, down: packet.down };
        break;
      case PacketType.PAD_STATE:
        if (!this.devices.gp) break;
        this.gamepad.updateState(packet.index, packet.buttons, packet.axes, packet.triggers);
        vizData = { t: 'gp', buttons: packet.buttons, axes: packet.axes, triggers: packet.triggers };
        break;
      case PacketType.PING: {
        const pong = encodePong(packet.timestamp, this.lastProcessingUs);
        this.opts.onLatencyUpdate?.({ processingUs: this.lastProcessingUs });
        return pong;
      }
      case PacketType.PONG:
        break;
    }

    const after = performance.now();
    if (packet.type !== PacketType.PONG) {
      this.lastProcessingUs = Math.round((after - before) * 1000);
    }

    if (vizData) this.sendInputViz(vizData);

    return null;
  }

  stop(): void {
    this.releaseAllKeys();
    ipcMain.removeHandler('host-input');
    ipcMain.removeHandler('host-peer-status');
    this.opts.window.webContents.send('stop-webrtc');
    this.gamepad.destroy();
    this.connected = false;
    this.opts.onStatus?.('Stopped');
  }

  private releaseAllKeys(): void {
    for (const [vk, scan] of this.heldKeys) {
      this.injector.keyPress(vk, scan, false);
      this.sendInputViz({ t: 'k', vk, down: false });
    }
    this.heldKeys.clear();
  }

  private sendInputViz(data: any): void {
    try { this.opts.window.webContents.send('input-viz', data); } catch {}
  }

  isConnected(): boolean { return this.connected; }
  isGamepadAvailable(): boolean { return this.gamepad.available; }
  getGamepadError(): string | null { return this.gamepad.initError; }
  getGamepadControllerCount(): number { return this.gamepad.controllerCount; }
}
