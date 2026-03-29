import React from 'react';
import type { LatencyInfo } from '@inputshare/shared';
import { StatusBar, LatencyDetail } from '@inputshare/ui';
import { StreamPanel } from './StreamPanel';

interface CapturePanelProps {
  visible: boolean;
  rttText: string;
  lat: LatencyInfo;
  captureLabel: string;
  activeLabel: string;
  pointerLocked: boolean;
  capturing: boolean;
  kbActive: boolean;
  captureZoneRef: React.RefObject<HTMLDivElement | null>;
  onCaptureClick: () => void;
  onDisconnect: () => void;
  globalCaptureMode: boolean;
  globalCaptureActive: boolean;
  onToggleGlobalCapture: () => void;
  hostIp: string | null;
}

export function CapturePanel({
  visible, rttText, lat, captureLabel, activeLabel,
  pointerLocked, capturing, kbActive, captureZoneRef,
  onCaptureClick, onDisconnect,
  globalCaptureMode, globalCaptureActive, onToggleGlobalCapture,
  hostIp,
}: CapturePanelProps) {
  const showOverlay = !pointerLocked && !(capturing && !kbActive);
  const showActive = pointerLocked || (capturing && !kbActive);

  return (
    <div className={`panel ${!visible ? 'hidden' : ''}`}>
      <div className="capture-header">
        <StatusBar color="green" text="Connected" rtt={rttText} compact />
        <button className="danger small" onClick={onDisconnect}>Disconnect</button>
      </div>
      <LatencyDetail lat={lat} className="compact-latency" />

      {globalCaptureMode ? (
        <div className="capture-zone global-capture-zone">
          {globalCaptureActive ? (
            <div className="capture-active">
              <p>Global capture active</p>
              <p className="capture-hint">All keyboard, mouse, and gamepad input is being captured</p>
              <p className="capture-hint">Press <kbd>Escape</kbd> to stop</p>
              <button className="danger" style={{ marginTop: 12 }} onClick={onToggleGlobalCapture}>Stop Capture</button>
            </div>
          ) : (
            <div className="capture-overlay">
              <p className="capture-title">Global Capture</p>
              <p className="capture-hint">Input will be captured even when this window is minimized</p>
              <p className="capture-hint" style={{ marginTop: 4, color: '#e94560', fontSize: 11 }}>Mouse wheel not available in global mode</p>
              <button className="primary" style={{ marginTop: 12 }} onClick={onToggleGlobalCapture}>Start Global Capture</button>
            </div>
          )}
        </div>
      ) : (
        <div ref={captureZoneRef} className="capture-zone" onClick={onCaptureClick}>
          <div className={`capture-overlay ${!showOverlay ? 'hidden' : ''}`}>
            <p className="capture-title">{captureLabel}</p>
            <p className="capture-hint">Press <kbd>Escape</kbd> to release</p>
          </div>
          <div className={`capture-active ${!showActive ? 'hidden' : ''}`}>
            <p>{activeLabel}</p>
            <p className="capture-hint">Press <kbd>Escape</kbd> to release</p>
          </div>
        </div>
      )}

      <StreamPanel hostIp={hostIp} visible={visible} />
    </div>
  );
}
