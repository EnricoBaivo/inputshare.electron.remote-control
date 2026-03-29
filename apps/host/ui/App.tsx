import React, { useState, useRef, useEffect } from 'react';
import { HostForm } from './components/HostForm';
import { SunshinePanel } from './components/SunshinePanel';
import { InputMonitor } from './components/InputMonitor';
import { useHostWebRTC } from './hooks/useHostWebRTC';

declare global {
  interface Window {
    api: {
      startHost(url: string, room: string, devices: { kb: boolean; gp: boolean }): Promise<any>;
      stopHost(): Promise<any>;
      getSignalingInfo(): Promise<{ port: number; ips: string[]; localUrl: string; lanUrls: string[] }>;
      onStatusUpdate(cb: (status: string) => void): void;
      onGamepadStatus(cb: (info: { available: boolean; error: string | null }) => void): void;
      onLatencyUpdate(cb: (stats: { processingUs: number }) => void): void;
      sendInput(data: ArrayBuffer): Promise<ArrayBuffer | null>;
      reportPeerStatus(status: string): Promise<any>;
      onStartWebRTC(cb: (config: { signalingUrl: string; roomId: string }) => void): void;
      onStopWebRTC(cb: () => void): void;
      onInputViz(cb: (data: any) => void): void;
      sunshineDetect(): Promise<any>;
      sunshineStatus(): Promise<any>;
      sunshineOpenWebUI(): Promise<any>;
      sunshineStartService(): Promise<any>;
      sunshineStopService(): Promise<any>;
    };
  }
}

function randomId() { return Math.random().toString(36).substring(2, 8).toUpperCase(); }

export function App() {
  const [roomId, setRoomId] = useState(randomId);
  const [hosting, setHosting] = useState(false);
  const [statusText, setStatusText] = useState('Idle');
  const [statusColor, setStatusColor] = useState('gray');
  const [gpStatus, setGpStatus] = useState({ color: 'gray', text: 'Gamepad: not initialized' });
  const [latStatus, setLatStatus] = useState({ color: 'gray', text: 'Processing: --' });
  const [guideOpen, setGuideOpen] = useState(false);
  const [kbChecked, setKbChecked] = useState(true);
  const [gpChecked, setGpChecked] = useState(true);
  const [signalingInfo, setSignalingInfo] = useState<{ port: number; ips: string[]; localUrl: string; lanUrls: string[] } | null>(null);

  const kbChkRef = useRef(true);
  const gpChkRef = useRef(true);

  useEffect(() => { kbChkRef.current = kbChecked; }, [kbChecked]);
  useEffect(() => { gpChkRef.current = gpChecked; }, [gpChecked]);

  useHostWebRTC({ kbCheckedRef: kbChkRef, gpCheckedRef: gpChkRef });

  // Fetch signaling info on mount
  useEffect(() => {
    window.api.getSignalingInfo().then(setSignalingInfo).catch(() => {});
  }, []);

  // IPC listeners
  useEffect(() => {
    window.api.onStatusUpdate((status) => {
      let color = 'yellow';
      if (status.includes('injecting') || status.includes('Connected')) color = 'green';
      else if (status.includes('disconnected') || status.includes('error') || status.includes('Error')) color = 'red';
      else if (status.includes('Waiting') || status.includes('Connecting')) color = 'yellow';
      else if (status.includes('Idle') || status.includes('Stopped')) color = 'gray';
      setStatusText(status); setStatusColor(color);
    });

    window.api.onGamepadStatus((info) => {
      setGpStatus(info.available
        ? { color: 'green', text: 'Gamepad: ViGEm ready (virtual X360)' }
        : { color: 'red', text: 'Gamepad: ' + (info.error || 'unavailable') });
    });

    window.api.onLatencyUpdate((stats) => {
      const us = stats.processingUs;
      const ms = (us / 1000).toFixed(2);
      const color = us < 500 ? 'green' : us < 2000 ? 'yellow' : 'red';
      setLatStatus({ color, text: `Processing: ${ms} ms (${us} \u00B5s)` });
    });
  }, []);

  const handleStart = async (signalingUrl: string) => {
    if (!signalingUrl || !roomId) return;
    setHosting(true);
    try { await window.api.startHost(signalingUrl, roomId, { kb: kbChecked, gp: gpChecked }); }
    catch (e: any) { setStatusText('Error: ' + e.message); setStatusColor('red'); setHosting(false); }
  };

  const handleStop = async () => {
    await window.api.stopHost();
    setHosting(false);
    setStatusText('Idle'); setStatusColor('gray');
  };

  return (
    <div className="container">
      <HostForm
        hosting={hosting}
        statusText={statusText} statusColor={statusColor}
        gpStatus={gpStatus} latStatus={latStatus}
        kbChecked={kbChecked} gpChecked={gpChecked}
        roomId={roomId} guideOpen={guideOpen} signalingInfo={signalingInfo}
        onKbChange={setKbChecked} onGpChange={setGpChecked}
        onRoomIdChange={setRoomId} onGuideToggle={setGuideOpen}
        onStart={handleStart} onStop={handleStop}
      />
      <SunshinePanel />
      <InputMonitor />
    </div>
  );
}
