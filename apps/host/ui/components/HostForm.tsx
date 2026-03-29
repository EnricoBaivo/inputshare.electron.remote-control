import React, { useState, useCallback } from 'react';
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

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [text]);
  return (
    <button className={`copy-btn ${copied ? 'copied' : ''}`} onClick={handleCopy} title={`Copy ${label || text}`}>
      {copied ? '\u2713' : '\u2398'}
    </button>
  );
}

export function HostForm({
  hosting, statusText, statusColor, gpStatus, latStatus,
  kbChecked, gpChecked, roomId, guideOpen, signalingInfo,
  onKbChange, onGpChange, onRoomIdChange, onGuideToggle,
  onStart, onStop,
}: HostFormProps) {
  const sigUrl = signalingInfo?.localUrl || 'ws://localhost:3001/ws';
  const lanUrls = signalingInfo?.lanUrls || [];
  const primaryLanUrl = lanUrls[0] || sigUrl;

  const [allCopied, setAllCopied] = useState(false);
  const copyAll = useCallback(() => {
    const text = `Server: ${primaryLanUrl}\nRoom ID: ${roomId}`;
    navigator.clipboard.writeText(text).then(() => {
      setAllCopied(true);
      setTimeout(() => setAllCopied(false), 1500);
    });
  }, [primaryLanUrl, roomId]);

  return (
    <>
      <div className="title-row">
        <h1>InputShare <span className="badge">HOST</span></h1>
        <button className="btn-icon" title="Setup guide" onClick={() => onGuideToggle(true)}>?</button>
      </div>

      {/* ── Connection Info Card ── */}
      <div className="connection-card">
        <div className="connection-header">
          <span className="connection-title">Connection Info</span>
          <button className={`copy-all-btn ${allCopied ? 'copied' : ''}`} onClick={copyAll}>
            {allCopied ? 'Copied!' : 'Copy All'}
          </button>
        </div>

        <div className="connection-row">
          <span className="connection-label">Server</span>
          <div className="connection-values">
            {lanUrls.map((url, i) => (
              <div key={i} className="connection-value-row">
                <code className="connection-value">{url}</code>
                <CopyButton text={url} label="server URL" />
              </div>
            ))}
            <div className="connection-value-row">
              <code className="connection-value local-url">{sigUrl}</code>
              <CopyButton text={sigUrl} label="localhost URL" />
              <span className="url-tag">local</span>
            </div>
          </div>
        </div>

        <div className="connection-row">
          <span className="connection-label">Room ID</span>
          <div className="connection-values">
            <div className="connection-value-row">
              <code className="connection-value room-id-value">{roomId}</code>
              <CopyButton text={roomId} label="room ID" />
              <button className="refresh-btn" onClick={() => onRoomIdChange(randomId())} disabled={hosting} title="Generate new ID">&#x21bb;</button>
            </div>
          </div>
        </div>

        <div className="connection-hint">Share the server URL and room ID with the client to connect</div>
      </div>

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
              <li>Click <strong>Copy All</strong> to copy server URL + room ID</li>
              <li>Click <strong>Start Hosting</strong></li>
              <li>On the client, paste the connection info and connect</li>
            </ol>
          </section>
          <section><h3>Gamepad support (optional)</h3>
            <p>The ViGEmBus driver installs automatically on first run. If it fails, install manually from the Nefarius GitHub releases page and reboot.</p>
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
