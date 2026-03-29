export interface AllowedDevices {
  kb: boolean; // keyboard + mouse
  gp: boolean; // gamepad
}

export interface LatencyInfo {
  oneway: string;
  hostProc: string;
  avgRtt: string;
  minmax: string;
}
