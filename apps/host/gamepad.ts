// Virtual Xbox 360 controller via ViGEmBus — koffi bindings (prebuilt, no compilation)
// All koffi operations are deferred to init() to avoid Electron startup crashes.
//
// ViGEmBus driver: https://github.com/nefarius/ViGEmBus/releases

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// ── VIGEM_ERROR codes ───────────────────────────────────────────
const VIGEM_ERROR_NONE                 = 0x20000000;
const VIGEM_ERROR_BUS_NOT_FOUND        = 0xE0000001;
const VIGEM_ERROR_NO_FREE_SLOT         = 0xE0000002;
const VIGEM_ERROR_INVALID_TARGET       = 0xE0000003;
const VIGEM_ERROR_REMOVAL_FAILED       = 0xE0000004;
const VIGEM_ERROR_ALREADY_CONNECTED    = 0xE0000005;
const VIGEM_ERROR_TARGET_UNINITIALIZED = 0xE0000006;
const VIGEM_ERROR_TARGET_NOT_PLUGGED_IN= 0xE0000007;
const VIGEM_ERROR_BUS_VERSION_MISMATCH = 0xE0000008;
const VIGEM_ERROR_BUS_ACCESS_FAILED    = 0xE0000009;

function vigemErrorString(code: number): string {
  const map: Record<number, string> = {
    [VIGEM_ERROR_NONE]:                  'Success',
    [VIGEM_ERROR_BUS_NOT_FOUND]:         'ViGEmBus driver not found — is it installed?',
    [VIGEM_ERROR_NO_FREE_SLOT]:          'No free controller slot (max 4)',
    [VIGEM_ERROR_INVALID_TARGET]:        'Invalid target',
    [VIGEM_ERROR_REMOVAL_FAILED]:        'Controller removal failed',
    [VIGEM_ERROR_ALREADY_CONNECTED]:     'Controller already connected',
    [VIGEM_ERROR_TARGET_UNINITIALIZED]:  'Target not initialized',
    [VIGEM_ERROR_TARGET_NOT_PLUGGED_IN]: 'Controller not plugged in',
    [VIGEM_ERROR_BUS_VERSION_MISMATCH]:  'ViGEmBus version mismatch — update the driver',
    [VIGEM_ERROR_BUS_ACCESS_FAILED]:     'Cannot access ViGEmBus — try running as admin',
  };
  return map[code] ?? `Unknown ViGEm error: 0x${code.toString(16)}`;
}

// ── XUSB button flags (Gamepad API index -> XUSB bitmask) ──────
const XUSB_BUTTON: Record<number, number> = {
  0:  0x1000, 1:  0x2000, 2:  0x4000, 3:  0x8000,
  4:  0x0100, 5:  0x0200, 8:  0x0020, 9:  0x0010,
  10: 0x0040, 11: 0x0080, 12: 0x0001, 13: 0x0002,
  14: 0x0004, 15: 0x0008, 16: 0x0400,
};

// ── Locate ViGEmClient.dll ──────────────────────────────────────
function getResourcesPath(): string {
  // In packaged app: process.resourcesPath points to <install>/resources/
  // In dev: fall back to project root
  try {
    const rp = (process as any).resourcesPath;
    if (rp && fs.existsSync(rp)) return rp;
  } catch {}
  return process.cwd();
}

function findViGEmDll(): string | null {
  const projectRoot = process.cwd();
  const resourcesPath = getResourcesPath();
  const candidates = [
    // Packaged app: extraResources puts DLL in resources/lib/
    path.join(resourcesPath, 'lib', 'ViGEmClient.dll'),
    // Dev: project root
    path.join(projectRoot, 'apps', 'host', 'lib', 'ViGEmClient.dll'),
    path.join(__dirname, '..', '..', '..', 'apps', 'host', 'lib', 'ViGEmClient.dll'),
    path.join(__dirname, 'lib', 'ViGEmClient.dll'),
    // System-wide installs
    'C:\\Program Files\\Nefarius Software Solutions e.U.\\ViGEmBus\\x64\\ViGEmClient.dll',
    'C:\\Program Files\\Nefarius Software Solutions\\ViGEm Bus Driver\\x64\\ViGEmClient.dll',
    'C:\\Program Files\\ViGEmBus\\x64\\ViGEmClient.dll',
    'C:\\Windows\\System32\\ViGEmClient.dll',
  ];

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        console.log(`Found ViGEmClient.dll at: ${p}`);
        return p;
      }
    } catch {}
  }

  return null;
}

// ── Locate ViGEmBus installer ───────────────────────────────────
function findViGEmInstaller(): string | null {
  const resourcesPath = getResourcesPath();
  const projectRoot = process.cwd();
  const candidates = [
    path.join(resourcesPath, 'vigem-setup', 'ViGEmBus_1.22.0_x64_x86_arm64.exe'),
    path.join(projectRoot, 'apps', 'host', 'lib', 'vigem-setup', 'ViGEmBus_1.22.0_x64_x86_arm64.exe'),
  ];
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  return null;
}

// ── Controller slot ─────────────────────────────────────────────
interface ControllerSlot {
  target: any;
  index: number;
}

// ── Lazy-loaded koffi function handles ──────────────────────────
let vigem_alloc: Function;
let vigem_free: Function;
let vigem_connect: Function;
let vigem_disconnect: Function;
let vigem_target_x360_alloc: Function;
let vigem_target_free: Function;
let vigem_target_add: Function;
let vigem_target_remove: Function;
let vigem_target_x360_update: Function;
let vigem_target_set_vid: Function;
let vigem_target_set_pid: Function;
let vigem_target_get_index: Function;
let XUSB_REPORT_type: any;
let PVIGEM_type: any;

// Custom VID/PID to identify our remote-shared controllers
const REMOTE_CONTROLLER_VID = 0x1234;
const REMOTE_CONTROLLER_PID = 0x5678;

const MAX_CONTROLLERS = 4;

export class GamepadInjector {
  private client: any = null;
  private controllers = new Map<number, ControllerSlot>();
  private ready = false;
  private _initError: string | null = null;

  get available(): boolean { return this.ready; }
  get initError(): string | null { return this._initError; }
  get controllerCount(): number { return this.controllers.size; }

  async init(): Promise<boolean> {
    // All koffi operations happen here, after Electron's app.whenReady()
    try {
      const koffi = require('koffi');

      if (!XUSB_REPORT_type) {
        XUSB_REPORT_type = koffi.struct('XUSB_REPORT', {
          wButtons:      'uint16',
          bLeftTrigger:  'uint8',
          bRightTrigger: 'uint8',
          sThumbLX:      'int16',
          sThumbLY:      'int16',
          sThumbRX:      'int16',
          sThumbRY:      'int16',
        });
      }

      const dllPath = findViGEmDll();
      if (!dllPath) {
        this._initError = 'ViGEmClient.dll not found';
        return false;
      }

      const lib = koffi.load(dllPath);
      if (!PVIGEM_type) PVIGEM_type = koffi.pointer('PVIGEM', koffi.opaque());
      const PVIGEM = PVIGEM_type;

      vigem_alloc              = lib.func('PVIGEM __cdecl vigem_alloc()');
      vigem_free               = lib.func('void __cdecl vigem_free(PVIGEM client)');
      vigem_connect            = lib.func('uint32 __cdecl vigem_connect(PVIGEM client)');
      vigem_disconnect         = lib.func('void __cdecl vigem_disconnect(PVIGEM client)');
      vigem_target_x360_alloc  = lib.func('PVIGEM __cdecl vigem_target_x360_alloc()');
      vigem_target_free        = lib.func('void __cdecl vigem_target_free(PVIGEM target)');
      vigem_target_add         = lib.func('uint32 __cdecl vigem_target_add(PVIGEM client, PVIGEM target)');
      vigem_target_remove      = lib.func('uint32 __cdecl vigem_target_remove(PVIGEM client, PVIGEM target)');
      vigem_target_x360_update = lib.func('uint32 __cdecl vigem_target_x360_update(PVIGEM client, PVIGEM target, XUSB_REPORT report)');
      vigem_target_set_vid     = lib.func('void __cdecl vigem_target_set_vid(PVIGEM target, uint16 vid)');
      vigem_target_set_pid     = lib.func('void __cdecl vigem_target_set_pid(PVIGEM target, uint16 pid)');
      vigem_target_get_index   = lib.func('uint32 __cdecl vigem_target_x360_get_user_index(PVIGEM client, PVIGEM target, uint32 *index)');

      // Allocate and connect
      this.client = vigem_alloc();
      if (!this.client) {
        this._initError = 'Failed to allocate ViGEm client';
        return false;
      }

      let err: number = vigem_connect(this.client);
      if (err === VIGEM_ERROR_BUS_NOT_FOUND) {
        // Try auto-installing ViGEmBus driver
        const installed = this.tryInstallViGEmBus();
        if (installed) {
          err = vigem_connect(this.client);
        }
      }
      if (err !== VIGEM_ERROR_NONE) {
        this._initError = vigemErrorString(err);
        vigem_free(this.client);
        this.client = null;
        return false;
      }

      this.ready = true;
      console.log('ViGEm client connected to bus');
      return true;
    } catch (e: any) {
      this._initError = e.message;
      console.warn('ViGEm init failed:', e.message);
      console.warn('Gamepad injection will be disabled.');
      return false;
    }
  }

  private tryInstallViGEmBus(): boolean {
    const installer = findViGEmInstaller();
    if (!installer) {
      console.warn('ViGEmBus installer not found, cannot auto-install');
      return false;
    }
    console.log('ViGEmBus driver not found — attempting auto-install...');
    try {
      // Run the installer silently with elevation
      execSync(`"${installer}" /quiet /norestart`, { timeout: 60000 });
      console.log('ViGEmBus driver installed successfully');
      return true;
    } catch (e: any) {
      console.warn('ViGEmBus auto-install failed:', e.message);
      return false;
    }
  }

  private ensureController(index: number): ControllerSlot | null {
    if (!this.ready || !this.client) return null;

    const existing = this.controllers.get(index);
    if (existing) return existing;

    if (this.controllers.size >= MAX_CONTROLLERS) return null;

    try {
      const target = vigem_target_x360_alloc();
      if (!target) return null;

      // Set custom VID/PID so games/Windows can identify this as a remote controller
      vigem_target_set_vid(target, REMOTE_CONTROLLER_VID);
      vigem_target_set_pid(target, REMOTE_CONTROLLER_PID);

      const err: number = vigem_target_add(this.client, target);
      if (err !== VIGEM_ERROR_NONE) {
        vigem_target_free(target);
        return null;
      }

      const slot: ControllerSlot = { target, index };
      this.controllers.set(index, slot);
      console.log(`Virtual X360 controller ${index} plugged in (${this.controllers.size}/${MAX_CONTROLLERS})`);
      return slot;
    } catch {
      return null;
    }
  }

  updateState(
    index: number,
    buttons: number,
    axes: [number, number, number, number],
    triggers: [number, number]
  ): void {
    if (!this.ready || !this.client) return;
    const slot = this.ensureController(index);
    if (!slot) return;

    let xusbButtons = 0;
    for (let i = 0; i < 17; i++) {
      if (buttons & (1 << i)) xusbButtons |= (XUSB_BUTTON[i] ?? 0);
    }

    const toShort = (v: number) => Math.max(-32768, Math.min(32767, Math.round(v * 32767)));

    try {
      vigem_target_x360_update(this.client, slot.target, {
        wButtons:      xusbButtons,
        bLeftTrigger:  Math.max(0, Math.min(255, Math.round(triggers[0] * 255))),
        bRightTrigger: Math.max(0, Math.min(255, Math.round(triggers[1] * 255))),
        sThumbLX:      toShort(axes[0]),
        sThumbLY:      toShort(-axes[1]),
        sThumbRX:      toShort(axes[2]),
        sThumbRY:      toShort(-axes[3]),
      });
    } catch {}
  }

  removeController(index: number): void {
    const slot = this.controllers.get(index);
    if (!slot || !this.client) return;
    try { vigem_target_remove(this.client, slot.target); } catch {}
    try { vigem_target_free(slot.target); } catch {}
    this.controllers.delete(index);
  }

  destroy(): void {
    for (const [, slot] of this.controllers) {
      if (this.client) {
        try { vigem_target_remove(this.client, slot.target); } catch {}
        try { vigem_target_free(slot.target); } catch {}
      }
    }
    this.controllers.clear();
    if (this.client) {
      try { vigem_disconnect(this.client); } catch {}
      try { vigem_free(this.client); } catch {}
      this.client = null;
    }
    this.ready = false;
  }
}
