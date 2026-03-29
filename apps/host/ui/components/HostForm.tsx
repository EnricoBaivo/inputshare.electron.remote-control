import React from 'react';
import { StatusBar, FormGroup, DeviceCheckboxes, GuideOverlay } from '@inputshare/ui';

function randomId() { return Math.random().toString(36).substring(2, 8).toUpperCase(); }

interface SignalingInfo {
  port: number;
  ips: string[];
  localUrl: string;
  lanUrls: string[];
}

interface HostFormProps {
  hosting: boolean;
  statusText: string;
  statusColor: string;
  gpStatus: { color: string; text: string };
  latStatus: { color: string; text: string };
  kbChecked: boolean;
  gpChecked: boolean;
  roomId: string;
  guideOpen: boolean;
  signalingInfo: SignalingInfo | null;
  onKbChange: (v: boolean) => void;
  onGpChange: (v: boolean) => void;
  onRoomIdChange: (v: string) => void;
  onGuideToggle: (v: boolean) => void;
  onStart: (signalingUrl: string) => void;
  onStop: () => void;
}

export function HostForm({
  hosting, statusText, statusColor, gpStatus, latStatus,
  kbChecked, gpChecked, roomId, guideOpen, signalingInfo,
  onKbChange, onGpChange, onRoomIdChange, onGuideToggle,
  onStart, onStop,
}: HostFormProps) {
  const sigUrl = signalingInfo?.localUrl || 'ws://localhost:3001/ws';

  return (
    <>
      <div className="title-row">
        <h1>InputShare <span className="badge">HOST</span></h1>
        <button className="btn-icon" title="Setup guide" onClick={() => onGuideToggle(true)}>?</button>
      </div>

      <FormGroup label="Signaling Server (built-in)">
        <div className="signaling-info">
          <div className="signaling-url">{sigUrl}</div>
          {signalingInfo && signalingInfo.lanUrls.length > 0 && (
            <div className="signaling-lan">
              LAN: {signalingInfo.lanUrls.map((url, i) => (
                <span key={i} className="lan-url">{url}</span>
              ))}
            </div>
          )}
        </div>
      </FormGroup>

      <FormGroup label="Room ID">
        <div className="room-row">
          <input type="text" value={roomId} onChange={e => onRoomIdChange(e.target.value)} spellCheck={false} disabled={hosting} />
          <button onClick={() => onRoomIdChange(randomId())} disabled={hosting} title="Generate random ID">&#x21bb;</button>
        </div>
      </FormGroup>

      <FormGroup label="Allowed Input Devices">
        <DeviceCheckboxes
          kbChecked={kbChecked} gpChecked={gpChecked}
          kbDisabled={hosting} gpDisabled={hosting}
          onKbChange={onKbChange} onGpChange={onGpChange}
        />
      </FormGroup>

      <div className="actions">
        <button className="primary" disabled={hosting} onClick={() => onStart(sigUrl)}>Start Hosting</button>
        <button className="danger" disabled={!hosting} onClick={onStop}>Stop</button>
      </div>

      <StatusBar color={statusColor} text={statusText} />
      <StatusBar color={gpStatus.color} text={gpStatus.text} className="gamepad-bar" />
      <StatusBar color={latStatus.color} text={latStatus.text} className="latency-bar" />

      {guideOpen && (
        <GuideOverlay title="Host Setup Guide" onClose={() => onGuideToggle(false)}>
          <section><h3>Quick start</h3>
            <ol>
              <li>The signaling server starts automatically with the host</li>
              <li>Share the <strong>LAN URL</strong> and <strong>Room ID</strong> with the client</li>
              <li>Click <strong>Start Hosting</strong></li>
              <li>On the client, enter the LAN URL and Room ID, then connect</li>
            </ol>
          </section>
          <section><h3>Gamepad support (optional)</h3>
            <ol>
              <li>Install the <strong>ViGEmBus driver</strong> from the Nefarius GitHub releases page</li>
              <li>Reboot after installation</li>
              <li>Place <code>ViGEmClient.dll</code> in <code>apps/host/lib/</code></li>
            </ol>
          </section>
          <section><h3>How it works</h3>
            <p>The client captures input and streams it over WebRTC. This host injects it into Windows via <code>SendInput()</code> and ViGEm (virtual Xbox 360 controller).</p>
            <p>The built-in signaling server handles WebRTC handshake only. Once connected, input flows peer-to-peer.</p>
          </section>
        </GuideOverlay>
      )}
    </>
  );
}
