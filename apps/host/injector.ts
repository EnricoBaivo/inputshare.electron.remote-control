// Win32 SendInput wrapper via koffi (prebuilt FFI — no native compilation)
// All koffi operations are deferred to first use to avoid Electron startup crashes.

import * as path from 'path';

// ── Win32 constants ─────────────────────────────────────────────
const INPUT_MOUSE    = 0;
const INPUT_KEYBOARD = 1;

const MOUSEEVENTF_MOVE       = 0x0001;
const MOUSEEVENTF_LEFTDOWN   = 0x0002;
const MOUSEEVENTF_LEFTUP     = 0x0004;
const MOUSEEVENTF_RIGHTDOWN  = 0x0008;
const MOUSEEVENTF_RIGHTUP    = 0x0010;
const MOUSEEVENTF_MIDDLEDOWN = 0x0020;
const MOUSEEVENTF_MIDDLEUP   = 0x0040;
const MOUSEEVENTF_WHEEL      = 0x0800;

const KEYEVENTF_EXTENDEDKEY = 0x0001;
const KEYEVENTF_KEYUP       = 0x0002;
const KEYEVENTF_SCANCODE    = 0x0008;

const INPUT_SIZE = 40; // sizeof(INPUT) on x64 Windows

// ── Lazy-initialized koffi bindings ─────────────────────────────
let SendInput: Function | null = null;

function ensureLoaded(): void {
  if (SendInput) return;
  const koffi = require('koffi');
  const user32 = koffi.load('user32.dll');
  SendInput = user32.func('uint32 __stdcall SendInput(uint32 nInputs, void *pInputs, int32 cbSize)');
}

// ── Helper: build INPUT buffers ─────────────────────────────────
function makeMouseInput(dx: number, dy: number, mouseData: number, flags: number): Buffer {
  const buf = Buffer.alloc(INPUT_SIZE, 0);
  buf.writeUInt32LE(INPUT_MOUSE, 0);
  const off = 8;
  buf.writeInt32LE(dx, off);
  buf.writeInt32LE(dy, off + 4);
  buf.writeUInt32LE(mouseData, off + 8);
  buf.writeUInt32LE(flags, off + 12);
  buf.writeUInt32LE(0, off + 16);
  return buf;
}

function makeKeyboardInput(vk: number, scan: number, flags: number): Buffer {
  const buf = Buffer.alloc(INPUT_SIZE, 0);
  buf.writeUInt32LE(INPUT_KEYBOARD, 0);
  const off = 8;
  buf.writeUInt16LE(vk, off);
  buf.writeUInt16LE(scan & 0xFF, off + 2);
  let dwFlags = flags;
  if (scan > 0xFF) dwFlags |= KEYEVENTF_EXTENDEDKEY;
  buf.writeUInt32LE(dwFlags, off + 4);
  buf.writeUInt32LE(0, off + 8);
  return buf;
}

function sendInputs(inputs: Buffer[]): void {
  if (inputs.length === 0) return;
  ensureLoaded();
  const combined = Buffer.concat(inputs);
  SendInput!(inputs.length, combined, INPUT_SIZE);
}

// ── Public API ──────────────────────────────────────────────────
export class WindowsInjector {
  moveMouse(dx: number, dy: number): void {
    sendInputs([makeMouseInput(dx, dy, 0, MOUSEEVENTF_MOVE)]);
  }

  mouseButton(button: number, down: boolean): void {
    let flags = 0;
    switch (button) {
      case 0: flags = down ? MOUSEEVENTF_LEFTDOWN   : MOUSEEVENTF_LEFTUP;   break;
      case 1: flags = down ? MOUSEEVENTF_RIGHTDOWN  : MOUSEEVENTF_RIGHTUP;  break;
      case 2: flags = down ? MOUSEEVENTF_MIDDLEDOWN : MOUSEEVENTF_MIDDLEUP; break;
      default: return;
    }
    sendInputs([makeMouseInput(0, 0, 0, flags)]);
  }

  mouseWheel(delta: number): void {
    sendInputs([makeMouseInput(0, 0, delta, MOUSEEVENTF_WHEEL)]);
  }

  keyPress(vk: number, scanCode: number, down: boolean): void {
    let flags = KEYEVENTF_SCANCODE;
    if (!down) flags |= KEYEVENTF_KEYUP;
    sendInputs([makeKeyboardInput(vk, scanCode, flags)]);
  }
}
