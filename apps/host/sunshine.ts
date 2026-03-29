// Sunshine (game streaming server) detection and management.
// Detects installation, checks Windows service status, probes API.

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { execSync } from 'child_process';
import { shell } from 'electron';

export interface SunshineStatus {
  installed: boolean;
  exePath: string | null;
  serviceRunning: boolean;
  apiReachable: boolean;
  webUiUrl: string;
}

const SEARCH_PATHS = [
  'C:\\Program Files\\Sunshine\\sunshine.exe',
  'C:\\Program Files\\LizardByte\\Sunshine\\sunshine.exe',
  'C:\\Program Files (x86)\\Sunshine\\sunshine.exe',
];

function findSunshineExe(): string | null {
  // Check known paths
  for (const p of SEARCH_PATHS) {
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  // Check PROGRAMDATA and LOCALAPPDATA
  const programData = process.env.PROGRAMDATA;
  const localAppData = process.env.LOCALAPPDATA;
  if (programData) {
    const p = path.join(programData, 'Sunshine', 'sunshine.exe');
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  if (localAppData) {
    const p = path.join(localAppData, 'Sunshine', 'sunshine.exe');
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  // Check PATH
  try {
    const result = execSync('where sunshine.exe', { timeout: 3000 }).toString().trim();
    if (result && fs.existsSync(result.split('\n')[0].trim())) return result.split('\n')[0].trim();
  } catch {}
  return null;
}

function checkServiceRunning(): boolean {
  try {
    const output = execSync('sc query SunshineService', { timeout: 5000 }).toString();
    return output.includes('RUNNING');
  } catch {
    return false;
  }
}

function probeApi(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = https.get('https://localhost:47990/api/configdir', {
      rejectUnauthorized: false,
      timeout: 3000,
    }, (res) => {
      resolve(res.statusCode !== undefined);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

export class SunshineManager {
  private _status: SunshineStatus = {
    installed: false,
    exePath: null,
    serviceRunning: false,
    apiReachable: false,
    webUiUrl: 'https://localhost:47990',
  };

  get status(): SunshineStatus { return { ...this._status }; }

  async detect(): Promise<SunshineStatus> {
    this._status.exePath = findSunshineExe();
    this._status.installed = this._status.exePath !== null;
    this._status.serviceRunning = checkServiceRunning();
    this._status.apiReachable = this._status.serviceRunning ? await probeApi() : false;
    return this.status;
  }

  async quickStatus(): Promise<SunshineStatus> {
    this._status.serviceRunning = checkServiceRunning();
    this._status.apiReachable = this._status.serviceRunning ? await probeApi() : false;
    return this.status;
  }

  openWebUI(): void {
    shell.openExternal(this._status.webUiUrl);
  }

  startService(): boolean {
    try {
      execSync('sc start SunshineService', { timeout: 10000 });
      return true;
    } catch {
      return false;
    }
  }

  stopService(): boolean {
    try {
      execSync('sc stop SunshineService', { timeout: 10000 });
      return true;
    } catch {
      return false;
    }
  }

  destroy(): void {}
}
