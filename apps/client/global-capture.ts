// Global input capture via Win32 polling — no hooks, no message pump.
// Uses GetAsyncKeyState (keyboard/mouse buttons), GetCursorPos (mouse movement),
// and XInputGetState (gamepad) at ~120Hz via setInterval.

import { VK_MAP } from '../../packages/shared/index';
import type { BrowserWindow } from 'electron';

// ── Build reverse VK→scan map from shared VK_MAP ───────────────
const VK_TO_SCAN = new Map<number, number>();
for (const entry of Object.values(VK_MAP)) {
  if (!VK_TO_SCAN.has(entry.vk)) {
    VK_TO_SCAN.set(entry.vk, entry.scan);
  }
}

// ── Mouse button VK → DOM button ID mapping ────────────────────
// DOM MouseEvent.button: 0=left, 1=middle, 2=right
const VK_MOUSE_MAP: [number, number][] = [
  [0x01, 0],  // VK_LBUTTON → button 0 (left)
  [0x04, 1],  // VK_MBUTTON → button 1 (middle)
  [0x02, 2],  // VK_RBUTTON → button 2 (right)
];

// ── XInput button bit → Browser Gamepad API button index ────────
const XINPUT_TO_GP_BUTTON: [number, number][] = [
  [0x1000, 0],   // A
  [0x2000, 1],   // B
  [0x4000, 2],   // X
  [0x8000, 3],   // Y
  [0x0100, 4],   // LB
  [0x0200, 5],   // RB
  [0x0020, 8],   // Back
  [0x0010, 9],   // Start
  [0x0040, 10],  // L3
  [0x0080, 11],  // R3
  [0x0001, 12],  // DPad Up
  [0x0002, 13],  // DPad Down
  [0x0004, 14],  // DPad Left
  [0x0008, 15],  // DPad Right
  [0x0400, 16],  // Guide
];

// ── VK codes to skip in keyboard polling (mouse buttons) ────────
const MOUSE_VKS = new Set([0x01, 0x02, 0x04, 0x05, 0x06]);

// ── Lazy-loaded koffi bindings ──────────────────────────────────
let GetAsyncKeyState: Function | null = null;
let GetCursorPos: Function | null = null;
let MapVirtualKeyW: Function | null = null;
let GCPOINT_type: any = null;

let XInputGetState: Function | null = null;
let GC_XINPUT_GAMEPAD_type: any = null;
let GC_XINPUT_STATE_type: any = null;
let xinputAvailable = false;

function ensureKbMouseLoaded(): void {
  if (GetAsyncKeyState) return;
  const koffi = require('koffi');
  const user32 = koffi.load('user32.dll');

  if (!GCPOINT_type) {
    GCPOINT_type = koffi.struct('GCPOINT', {
      x: 'int32',
      y: 'int32',
    });
  }

  GetAsyncKeyState = user32.func('int16 __stdcall GetAsyncKeyState(int32 vKey)');
  GetCursorPos = user32.func('int32 __stdcall GetCursorPos(_Out_ GCPOINT *lpPoint)');
  MapVirtualKeyW = user32.func('uint32 __stdcall MapVirtualKeyW(uint32 uCode, uint32 uMapType)');
}

function ensureXInputLoaded(): boolean {
  if (XInputGetState) return true;
  try {
    const koffi = require('koffi');

    if (!GC_XINPUT_GAMEPAD_type) {
      GC_XINPUT_GAMEPAD_type = koffi.struct('GC_XINPUT_GAMEPAD', {
        wButtons: 'uint16',
        bLeftTrigger: 'uint8',
        bRightTrigger: 'uint8',
        sThumbLX: 'int16',
        sThumbLY: 'int16',
        sThumbRX: 'int16',
        sThumbRY: 'int16',
      });
    }

    if (!GC_XINPUT_STATE_type) {
      GC_XINPUT_STATE_type = koffi.struct('GC_XINPUT_STATE', {
        dwPacketNumber: 'uint32',
        Gamepad: 'GC_XINPUT_GAMEPAD',
      });
    }

    const xinput = koffi.load('xinput1_4.dll');
    XInputGetState = xinput.func('uint32 __stdcall XInputGetState(uint32 dwUserIndex, _Out_ GC_XINPUT_STATE *pState)');
    xinputAvailable = true;
    return true;
  } catch {
    xinputAvailable = false;
    return false;
  }
}

// ── GlobalCapture class ─────────────────────────────────────────

export interface GlobalCaptureOptions {
  window: BrowserWindow;
  pollRateHz?: number;
}

export class GlobalCapture {
  private opts: GlobalCaptureOptions;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private pollActive = false;
  private _running = false;
  private _initError: string | null = null;
  private captureKb = true;
  private captureGp = true;

  // Keyboard state: 256 entries, 0=up 1=down
  private prevKeys = new Uint8Array(256);

  // Mouse state
  private prevCursorX = 0;
  private prevCursorY = 0;
  private prevMouseButtons = 0;

  // Gamepad state
  private prevPadPacket = new Uint32Array(4);

  get running(): boolean { return this._running; }
  get initError(): string | null { return this._initError; }

  constructor(opts: GlobalCaptureOptions) {
    this.opts = opts;
  }

  init(): boolean {
    try {
      ensureKbMouseLoaded();
      ensureXInputLoaded(); // optional, don't fail if missing
      return true;
    } catch (e: any) {
      this._initError = e.message;
      console.warn('GlobalCapture init failed:', e.message);
      return false;
    }
  }

  start(devices?: { kb: boolean; gp: boolean }): void {
    if (this._running) this.stop();
    this.captureKb = devices?.kb ?? true;
    this.captureGp = devices?.gp ?? true;

    // Reset state
    this.prevKeys.fill(0);
    this.prevMouseButtons = 0;
    this.prevPadPacket.fill(0);

    // Initialize cursor position to avoid first-poll delta spike
    if (GetCursorPos) {
      const pt = { x: 0, y: 0 };
      GetCursorPos(pt);
      this.prevCursorX = pt.x;
      this.prevCursorY = pt.y;
    }

    this.pollActive = true;
    this._running = true;
    this.schedulePoll();
  }

  private schedulePoll(): void {
    if (!this.pollActive) return;
    // setImmediate fires on every event loop tick (~1-4ms in Electron)
    // Much faster than setInterval which is clamped to ~15ms on Windows
    this.pollTimer = setImmediate(() => {
      this.poll();
      this.schedulePoll();
    }) as any;
  }

  stop(): void {
    this.pollActive = false;
    if (this.pollTimer) {
      clearImmediate(this.pollTimer as any);
      this.pollTimer = null;
    }
    if (this._running) {
      // Release all held keys
      this.releaseAllHeld();
    }
    this._running = false;
  }

  destroy(): void {
    this.stop();
  }

  // ── Polling ─────────────────────────────────────────────────

  private poll(): void {
    if (this.captureKb) {
      this.pollKeyboard();
      this.pollMouse();
    }
    if (this.captureGp && xinputAvailable) {
      this.pollGamepads();
    }
  }

  private pollKeyboard(): void {
    for (let vk = 0x08; vk <= 0xFE; vk++) {
      // Skip mouse button VKs (handled in pollMouse)
      if (MOUSE_VKS.has(vk)) continue;

      const state: number = GetAsyncKeyState!(vk);
      const isDown = (state & 0x8000) !== 0;
      const wasDown = this.prevKeys[vk] !== 0;

      if (isDown !== wasDown) {
        this.prevKeys[vk] = isDown ? 1 : 0;

        // Escape stops capture instead of forwarding
        if (vk === 0x1B && isDown) {
          this.stop();
          this.send('gc-stopped');
          return;
        }

        const scan = VK_TO_SCAN.get(vk) ?? MapVirtualKeyW!(vk, 0);
        if (scan !== 0) {
          this.send('gc-key', { vk, scan, down: isDown });
        }
      }
    }
  }

  private pollMouse(): void {
    // Cursor movement
    const pt = { x: 0, y: 0 };
    GetCursorPos!(pt);
    const dx = pt.x - this.prevCursorX;
    const dy = pt.y - this.prevCursorY;
    this.prevCursorX = pt.x;
    this.prevCursorY = pt.y;

    if (dx !== 0 || dy !== 0) {
      this.send('gc-mouse-move', { dx, dy });
    }

    // Mouse buttons
    for (const [vk, button] of VK_MOUSE_MAP) {
      const state: number = GetAsyncKeyState!(vk);
      const isDown = (state & 0x8000) !== 0;
      const bit = 1 << button;
      const wasDown = (this.prevMouseButtons & bit) !== 0;
      if (isDown !== wasDown) {
        if (isDown) this.prevMouseButtons |= bit; else this.prevMouseButtons &= ~bit;
        this.send('gc-mouse-btn', { button, down: isDown });
      }
    }
  }

  private pollGamepads(): void {
    for (let i = 0; i < 4; i++) {
      const state = {
        dwPacketNumber: 0,
        Gamepad: {
          wButtons: 0, bLeftTrigger: 0, bRightTrigger: 0,
          sThumbLX: 0, sThumbLY: 0, sThumbRX: 0, sThumbRY: 0,
        },
      };
      const result: number = XInputGetState!(i, state);
      if (result !== 0) continue; // ERROR_SUCCESS = 0
      if (state.dwPacketNumber === this.prevPadPacket[i]) continue;
      this.prevPadPacket[i] = state.dwPacketNumber;

      const gp = state.Gamepad;

      // Map XInput buttons to browser Gamepad API button indices
      let buttons = 0;
      for (const [xinputBit, gpIndex] of XINPUT_TO_GP_BUTTON) {
        if (gp.wButtons & xinputBit) buttons |= (1 << gpIndex);
      }

      // Normalize axes to [-1, 1], triggers to [0, 1]
      const DEADZONE = 0.05;
      const norm = (v: number) => { const n = v / 32767; return Math.abs(n) < DEADZONE ? 0 : n; };
      const axes: [number, number, number, number] = [
        norm(gp.sThumbLX),
        norm(-gp.sThumbLY),  // Invert Y (XInput Y-up, protocol Y-down)
        norm(gp.sThumbRX),
        norm(-gp.sThumbRY),
      ];
      const lt = gp.bLeftTrigger / 255;
      const rt = gp.bRightTrigger / 255;
      const triggers: [number, number] = [
        lt < DEADZONE ? 0 : lt,
        rt < DEADZONE ? 0 : rt,
      ];

      this.send('gc-gamepad', { index: i, buttons, axes, triggers });
    }
  }

  private releaseAllHeld(): void {
    // Send key-up for all held keys
    for (let vk = 0x08; vk <= 0xFE; vk++) {
      if (this.prevKeys[vk]) {
        const scan = VK_TO_SCAN.get(vk) ?? (MapVirtualKeyW ? MapVirtualKeyW(vk, 0) : 0);
        if (scan !== 0) {
          this.send('gc-key', { vk, scan, down: false });
        }
        this.prevKeys[vk] = 0;
      }
    }
    // Send button-up for all held mouse buttons
    for (const [, button] of VK_MOUSE_MAP) {
      const bit = 1 << button;
      if (this.prevMouseButtons & bit) {
        this.send('gc-mouse-btn', { button, down: false });
      }
    }
    this.prevMouseButtons = 0;
  }

  private send(channel: string, data?: any): void {
    try {
      if (data !== undefined) {
        this.opts.window.webContents.send(channel, data);
      } else {
        this.opts.window.webContents.send(channel);
      }
    } catch {}
  }
}
