import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { AllowedDevices } from '@inputshare/shared';
import { ConnectPanel } from './components/ConnectPanel';
import { CapturePanel } from './components/CapturePanel';
import { useLatency } from './hooks/useLatency';
import { useClientWebRTC } from './hooks/useClientWebRTC';
import { useInputCapture } from './hooks/useInputCapture';
import { useGamepadPoll } from './hooks/useGamepadPoll';
import { useGlobalCapture } from './hooks/useGlobalCapture';

export function App() {
  const [panel, setPanel] = useState<'connect' | 'capture'>('connect');
  const [statusText, setStatusText] = useState('Disconnected');
  const [statusColor, setStatusColor] = useState('gray');
  const [guideOpen, setGuideOpen] = useState(false);
  const [connectDisabled, setConnectDisabled] = useState(false);
  const [kbChecked, setKbChecked] = useState(true);
  const [gpChecked, setGpChecked] = useState(true);
  const [kbDisabled, setKbDisabled] = useState(false);
  const [gpDisabled, setGpDisabled] = useState(false);
  const [deviceHint, setDeviceHint] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [pointerLocked, setPointerLocked] = useState(false);
  const [captureLabel, setCaptureLabel] = useState('Click here to capture input');
  const [activeLabel, setActiveLabel] = useState('Input captured');
  const [globalCaptureMode, setGlobalCaptureMode] = useState(false);
  const [globalCaptureActive, setGlobalCaptureActive] = useState(false);

  const captureZoneRef = useRef<HTMLDivElement>(null);
  const capRef = useRef(false);
  const hostCapsRef = useRef<AllowedDevices>({ kb: true, gp: true });
  const kbRef = useRef(true);
  const gpRef = useRef(true);

  useEffect(() => { kbRef.current = kbChecked && hostCapsRef.current.kb; }, [kbChecked]);
  useEffect(() => { gpRef.current = gpChecked && hostCapsRef.current.gp; }, [gpChecked]);

  const { rttText, lat, updateLatency } = useLatency();

  const setStatus = useCallback((text: string, color: string) => {
    setStatusText(text); setStatusColor(color);
  }, []);

  const handleCapabilities = useCallback((caps: AllowedDevices) => {
    hostCapsRef.current = caps;
    if (!caps.kb) { setKbChecked(false); setKbDisabled(true); } else setKbDisabled(false);
    if (!caps.gp) { setGpChecked(false); setGpDisabled(true); } else setGpDisabled(false);
    const parts: string[] = [];
    if (!caps.kb) parts.push('Keyboard+Mouse disabled by host');
    if (!caps.gp) parts.push('Gamepad disabled by host');
    setDeviceHint(parts.join('. '));
  }, []);

  const showConnectPanel = useCallback(() => {
    setPanel('connect');
    setConnectDisabled(false);
  }, []);

  const { sendR, sendU, connect, disconnect: rtcDisconnect, stopPingLoop } = useClientWebRTC({
    onStatusChange: setStatus,
    onLatency: updateLatency,
    onConnected: () => setPanel('capture'),
    onDisconnected: showConnectPanel,
    onCapabilities: handleCapabilities,
  });

  const { onKeyDown, onKeyUp, onMouseMove, onMouseDown, onMouseUp, onWheel, releaseAllHeld } = useInputCapture({
    sendR, sendU, kbRef,
  });

  const { startGamepadPoll, stopGamepadPoll } = useGamepadPoll({ sendR, gpRef });

  // ── Global capture ──
  const handleGcStopped = useCallback(() => {
    setGlobalCaptureActive(false);
  }, []);

  useGlobalCapture({
    sendR, sendU,
    active: globalCaptureActive,
    onStopped: handleGcStopped,
  });

  const toggleGlobalCapture = useCallback(async () => {
    const api = (window as any).api;
    if (globalCaptureActive) {
      await api.stopGlobalCapture();
      setGlobalCaptureActive(false);
    } else {
      await api.startGlobalCapture({ kb: kbRef.current, gp: gpRef.current });
      setGlobalCaptureActive(true);
    }
  }, [globalCaptureActive]);

  // ── DOM Capture lifecycle ──
  const startCapture = useCallback(() => {
    if (globalCaptureMode) return; // Don't start DOM capture in global mode
    capRef.current = true;
    setCapturing(true);
    const useK = kbRef.current;
    const useG = gpRef.current;
    if (useK && useG) { setCaptureLabel('Click here to capture input'); setActiveLabel('Keyboard + Mouse + Gamepad captured'); }
    else if (useK) { setCaptureLabel('Click here to capture keyboard + mouse'); setActiveLabel('Keyboard + Mouse captured'); }
    else { setCaptureLabel('Click here to start gamepad capture'); setActiveLabel('Gamepad captured (mouse/keyboard free)'); }
    if (useK) {
      window.addEventListener('keydown', onKeyDown, true);
      window.addEventListener('mousemove', onMouseMove, true);
      window.addEventListener('mousedown', onMouseDown, true);
      window.addEventListener('wheel', onWheel, { capture: true, passive: false } as any);
    }
    startGamepadPoll();
  }, [globalCaptureMode, onKeyDown, onMouseMove, onMouseDown, onWheel, startGamepadPoll]);

  const stopCapture = useCallback(() => {
    releaseAllHeld();
    capRef.current = false;
    setCapturing(false);
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('mousemove', onMouseMove, true);
    window.removeEventListener('mousedown', onMouseDown, true);
    window.removeEventListener('wheel', onWheel, true);
    stopGamepadPoll();
    if (document.pointerLockElement) document.exitPointerLock();
  }, [releaseAllHeld, onKeyDown, onMouseMove, onMouseDown, onWheel, stopGamepadPoll]);

  // ── Pointer lock (DOM mode only) ──
  useEffect(() => {
    if (globalCaptureMode) return;
    const onPLChange = () => {
      const locked = !!document.pointerLockElement;
      setPointerLocked(locked);
      if (locked && !capRef.current) startCapture();
      if (!locked && capRef.current && kbRef.current) stopCapture();
    };
    document.addEventListener('pointerlockchange', onPLChange);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('mouseup', onMouseUp, true);
    return () => {
      document.removeEventListener('pointerlockchange', onPLChange);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('mouseup', onMouseUp, true);
    };
  }, [globalCaptureMode, startCapture, stopCapture, onKeyUp, onMouseUp]);

  // Escape for gamepad-only DOM mode
  useEffect(() => {
    if (globalCaptureMode) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.code === 'Escape' && capRef.current && !kbRef.current && !document.pointerLockElement) {
        stopCapture();
      }
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [globalCaptureMode, stopCapture]);

  const handleCaptureClick = useCallback(() => {
    if (globalCaptureMode) return; // Handled by toggle button in global mode
    if (kbRef.current) {
      if (!document.pointerLockElement) captureZoneRef.current?.requestPointerLock();
    } else if (gpRef.current && !capRef.current) {
      startCapture();
    }
  }, [globalCaptureMode, startCapture]);

  const handleConnect = useCallback((url: string, room: string) => {
    setConnectDisabled(true);
    connect(url, room);
  }, [connect]);

  const handleDisconnect = useCallback(async () => {
    if (globalCaptureActive) {
      await (window as any).api.stopGlobalCapture();
      setGlobalCaptureActive(false);
    }
    stopCapture(); rtcDisconnect();
    showConnectPanel();
  }, [globalCaptureActive, stopCapture, rtcDisconnect, showConnectPanel]);

  return (
    <div className="container">
      <ConnectPanel
        visible={panel === 'connect'}
        statusText={statusText} statusColor={statusColor}
        rttText={rttText} lat={lat}
        kbChecked={kbChecked} gpChecked={gpChecked}
        kbDisabled={kbDisabled} gpDisabled={gpDisabled}
        deviceHint={deviceHint} connectDisabled={connectDisabled}
        guideOpen={guideOpen} globalCaptureMode={globalCaptureMode}
        onKbChange={setKbChecked} onGpChange={setGpChecked}
        onGuideToggle={setGuideOpen} onCaptureMethodChange={setGlobalCaptureMode}
        onConnect={handleConnect}
      />
      <CapturePanel
        visible={panel === 'capture'}
        rttText={rttText} lat={lat}
        captureLabel={captureLabel} activeLabel={activeLabel}
        pointerLocked={pointerLocked} capturing={capturing}
        kbActive={kbRef.current}
        captureZoneRef={captureZoneRef}
        onCaptureClick={handleCaptureClick}
        onDisconnect={handleDisconnect}
        globalCaptureMode={globalCaptureMode}
        globalCaptureActive={globalCaptureActive}
        onToggleGlobalCapture={toggleGlobalCapture}
      />
    </div>
  );
}
