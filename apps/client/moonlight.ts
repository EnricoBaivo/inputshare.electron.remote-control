// Moonlight (game streaming client) detection and process management.
// Detects installation, launches streaming, handles pairing flow.

import * as fs from 'fs';
import * as path from 'path';
import { execSync, spawn, type ChildProcess } from 'child_process';
import type { BrowserWindow } from 'electron';

export interface MoonlightStatus {
  installed: boolean;
  exePath: string | null;
  running: boolean;
}

const SEARCH_PATHS = [
  'C:\\Program Files\\Moonlight Game Streaming\\Moonlight.exe',
  'C:\\Program Files (x86)\\Moonlight Game Streaming\\Moonlight.exe',
];

function findMoonlightExe(): string | null {
  for (const p of SEARCH_PATHS) {
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    const candidates = [
      path.join(localAppData, 'Moonlight Game Streaming', 'Moonlight.exe'),
      path.join(localAppData, 'Programs', 'Moonlight Game Streaming', 'Moonlight.exe'),
    ];
    for (const p of candidates) {
      try { if (fs.existsSync(p)) return p; } catch {}
    }
  }
  // Check PATH
  try {
    const result = execSync('where Moonlight.exe', { timeout: 3000 }).toString().trim();
    if (result && fs.existsSync(result.split('\n')[0].trim())) return result.split('\n')[0].trim();
  } catch {}
  return null;
}

export class MoonlightManager {
  private _status: MoonlightStatus = { installed: false, exePath: null, running: false };
  private _process: ChildProcess | null = null;
  private _pairProcess: ChildProcess | null = null;
  private window: BrowserWindow;

  get status(): MoonlightStatus { return { ...this._status }; }

  constructor(window: BrowserWindow) {
    this.window = window;
  }

  detect(): MoonlightStatus {
    this._status.exePath = findMoonlightExe();
    this._status.installed = this._status.exePath !== null;
    return this.status;
  }

  stream(hostIp: string, appName: string = 'Desktop'): boolean {
    if (!this._status.exePath || this._process) return false;
    this._process = spawn(this._status.exePath, ['stream', hostIp, appName], {
      detached: false,
      stdio: 'pipe',
    });
    this._status.running = true;
    this._process.on('exit', (code) => {
      this._status.running = false;
      this._process = null;
      this.send('moonlight-process-exit', code);
    });
    this._process.stderr?.on('data', (data) => {
      const msg = data.toString();
      // Detect pairing requirement
      if (msg.toLowerCase().includes('pair') || msg.toLowerCase().includes('not paired')) {
        this.send('moonlight-needs-pair');
      }
    });
    return true;
  }

  stop(): void {
    if (this._process) {
      try { this._process.kill(); } catch {}
      this._process = null;
      this._status.running = false;
    }
  }

  async pair(hostIp: string): Promise<void> {
    if (!this._status.exePath) {
      this.send('moonlight-pair-result', { success: false, error: 'Moonlight not installed' });
      return;
    }
    this._pairProcess = spawn(this._status.exePath, ['pair', hostIp], {
      detached: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let output = '';
    this._pairProcess.stdout?.on('data', (data) => {
      output += data.toString();
      // Moonlight asks for PIN
      if (output.toLowerCase().includes('pin')) {
        this.send('moonlight-pair-prompt');
      }
    });
    this._pairProcess.stderr?.on('data', (data) => {
      output += data.toString();
    });
    this._pairProcess.on('exit', (code) => {
      this.send('moonlight-pair-result', {
        success: code === 0,
        error: code !== 0 ? (output || `Exit code ${code}`) : undefined,
      });
      this._pairProcess = null;
    });
  }

  sendPairPin(pin: string): void {
    if (this._pairProcess?.stdin?.writable) {
      this._pairProcess.stdin.write(pin + '\n');
    }
  }

  async listApps(hostIp: string): Promise<string[]> {
    if (!this._status.exePath) return [];
    return new Promise((resolve) => {
      const proc = spawn(this._status.exePath!, ['list', hostIp], {
        detached: false,
        stdio: 'pipe',
      });
      let output = '';
      proc.stdout?.on('data', (d) => { output += d.toString(); });
      proc.on('exit', () => {
        const apps = output.split('\n')
          .map(l => l.trim())
          .filter(l => l.length > 0 && !l.startsWith('Searching') && !l.startsWith('Connect'));
        resolve(apps);
      });
      setTimeout(() => { try { proc.kill(); } catch {} resolve([]); }, 10000);
    });
  }

  isRunning(): boolean { return this._status.running; }

  destroy(): void {
    this.stop();
    if (this._pairProcess) {
      try { this._pairProcess.kill(); } catch {}
      this._pairProcess = null;
    }
  }

  private send(channel: string, data?: any): void {
    try {
      if (data !== undefined) this.window.webContents.send(channel, data);
      else this.window.webContents.send(channel);
    } catch {}
  }
}
