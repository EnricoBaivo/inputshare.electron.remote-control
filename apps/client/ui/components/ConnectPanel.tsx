import React, { useRef } from 'react';
import type { LatencyInfo } from '@inputshare/shared';
import { StatusBar, FormGroup, DeviceCheckboxes, LatencyDetail, GuideOverlay } from '@inputshare/ui';

interface ConnectPanelProps {
  visible: boolean;
  statusText: string;
  statusColor: string;
  rttText: string;
  lat: LatencyInfo;
  kbChecked: boolean;
  gpChecked: boolean;
  kbDisabled: boolean;
  gpDisabled: boolean;
  deviceHint: string;
  connectDisabled: boolean;
  guideOpen: boolean;
  globalCaptureMode: boolean;
  onKbChange: (v: boolean) => void;
  onGpChange: (v: boolean) => void;
  onGuideToggle: (v: boolean) => void;
  onCaptureMethodChange: (global: boolean) => void;
  onConnect: (url: string, room: string) => void;
}

export function ConnectPanel({
  visible, statusText, statusColor, rttText, lat,
  kbChecked, gpChecked, kbDisabled, gpDisabled, deviceHint,
  connectDisabled, guideOpen, globalCaptureMode,
  onKbChange, onGpChange, onGuideToggle, onCaptureMethodChange, onConnect,
}: ConnectPanelProps) {
  const sigRef = useRef<HTMLInputElement>(null);
  const roomRef = useRef<HTMLInputElement>(null);

  const handleConnect = () => {
    const url = sigRef.current?.value.trim();
    const room = roomRef.current?.value.trim();
    if (url && room) onConnect(url, room);
  };

  return (
    <div className={`panel ${!visible ? 'hidden' : ''}`}>
      <div className="title-row">
        <h1>InputShare <span className="badge">CLIENT</span></h1>
        <button className="btn-icon" title="Setup guide" onClick={() => onGuideToggle(true)}>?</button>
      </div>

      <FormGroup label="Signaling Server">
        <input ref={sigRef} type="text" defaultValue="ws://localhost:3001/ws" spellCheck={false} />
      </FormGroup>

      <FormGroup label="Room ID">
        <input ref={roomRef} type="text" placeholder="Enter room ID from host" spellCheck={false} />
      </FormGroup>

      <FormGroup label="Input Mode">
        <DeviceCheckboxes
          kbChecked={kbChecked} gpChecked={gpChecked}
          kbDisabled={kbDisabled} gpDisabled={gpDisabled}
          onKbChange={onKbChange} onGpChange={onGpChange}
          hint={deviceHint}
        />
      </FormGroup>

      <FormGroup label="Capture Method">
        <div className="capture-method">
          <label className="check-label">
            <input type="radio" name="captureMethod" checked={!globalCaptureMode} onChange={() => onCaptureMethodChange(false)} />
            Window Focus (pointer lock)
          </label>
          <label className="check-label">
            <input type="radio" name="captureMethod" checked={globalCaptureMode} onChange={() => onCaptureMethodChange(true)} />
            Global (works when minimized)
          </label>
        </div>
      </FormGroup>

      <button className="primary full" disabled={connectDisabled} onClick={handleConnect}>Connect</button>

      <StatusBar color={statusColor} text={statusText} rtt={rttText} className="mt-14" />
      <LatencyDetail lat={lat} />

      {guideOpen && (
        <GuideOverlay title="Client Setup Guide" onClose={() => onGuideToggle(false)}>
          <section><h3>Quick start</h3>
            <ol>
              <li>Make sure the <strong>signaling server</strong> is running (<code>bun run apps/signaling/server.ts</code>)</li>
              <li>Make sure the <strong>host</strong> is running and has started hosting</li>
              <li>Enter the <strong>signaling server URL</strong> (default works for local network)</li>
              <li>Enter the <strong>Room ID</strong> shown on the host app</li>
              <li>Click <strong>Connect</strong></li>
              <li>Once connected, <strong>click the capture zone</strong> to lock your mouse and start sending input</li>
              <li>Press <strong>Escape</strong> to release mouse and stop capturing</li>
            </ol>
          </section>
          <section><h3>Input types</h3>
            <ul>
              <li><strong>Keyboard:</strong> All keys captured and forwarded (except Escape). Maps to Windows virtual key codes.</li>
              <li><strong>Mouse:</strong> Movement, clicks, and scroll wheel. Uses pointer lock for raw deltas.</li>
              <li><strong>Gamepad:</strong> Auto-detected via browser Gamepad API. Full analog precision. Requires ViGEmBus on host.</li>
            </ul>
          </section>
          <section><h3>Latency display</h3>
            <ul>
              <li><strong>RTT</strong> — round-trip via ping/pong on the DataChannel</li>
              <li><strong>Input latency (est.)</strong> — one-way estimate (RTT / 2)</li>
              <li><strong>Host processing</strong> — decode + inject time on host</li>
              <li><strong>Avg / Min / Max</strong> — rolling window of last 10 samples</li>
            </ul>
          </section>
          <section><h3>Troubleshooting</h3>
            <ul>
              <li><strong>"Connection error"</strong> — Check signaling server is running and URL is correct</li>
              <li><strong>"Waiting for host..."</strong> — Host hasn't started or Room ID doesn't match</li>
              <li><strong>Mouse not moving on host</strong> — Click capture zone to enter pointer lock first</li>
              <li><strong>Keys stuck</strong> — Click capture zone and press/release the stuck key</li>
            </ul>
          </section>
        </GuideOverlay>
      )}
    </div>
  );
}
