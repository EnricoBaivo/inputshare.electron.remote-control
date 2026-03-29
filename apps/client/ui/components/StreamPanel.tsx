import React, { useState, useEffect, useCallback } from 'react';
import { StreamingStatus } from '@inputshare/ui';

interface MoonlightStatus {
  installed: boolean;
  exePath: string | null;
  running: boolean;
}

interface StreamPanelProps {
  hostIp: string | null;
  visible: boolean;
}

export function StreamPanel({ hostIp, visible }: StreamPanelProps) {
  const [status, setStatus] = useState<MoonlightStatus | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [pairingState, setPairingState] = useState<'idle' | 'waiting-pin' | 'pairing' | 'success' | 'failed'>('idle');
  const [pairError, setPairError] = useState('');
  const [pin, setPin] = useState('');
  const [manualIp, setManualIp] = useState('');
  const [exitCode, setExitCode] = useState<number | null>(null);

  const effectiveIp = hostIp || manualIp || null;
  const api = (window as any).api;

  useEffect(() => {
    api.moonlightDetect().then(setStatus);
  }, []);

  useEffect(() => {
    api.onMoonlightProcessExit((code: number | null) => {
      setStreaming(false);
      setExitCode(code);
    });
    api.onMoonlightNeedsPair(() => {
      setStreaming(false);
      setPairingState('waiting-pin');
    });
    api.onMoonlightPairPrompt(() => {
      setPairingState('waiting-pin');
    });
    api.onMoonlightPairResult((result: { success: boolean; error?: string }) => {
      if (result.success) {
        setPairingState('success');
        setTimeout(() => setPairingState('idle'), 2000);
      } else {
        setPairingState('failed');
        setPairError(result.error || 'Unknown error');
      }
    });
    return () => api.removeMoonlightListeners();
  }, []);

  const handleStream = useCallback(async () => {
    if (!effectiveIp) return;
    setExitCode(null);
    const result = await api.moonlightStream(effectiveIp, 'Desktop');
    if (result.ok) setStreaming(true);
  }, [effectiveIp]);

  const handleStop = useCallback(async () => {
    await api.moonlightStop();
    setStreaming(false);
  }, []);

  const handlePair = useCallback(async () => {
    if (!effectiveIp) return;
    setPairingState('pairing');
    setPairError('');
    await api.moonlightPair(effectiveIp);
  }, [effectiveIp]);

  const handleSendPin = useCallback(async () => {
    if (!pin) return;
    await api.moonlightPairPin(pin);
    setPin('');
    setPairingState('pairing');
  }, [pin]);

  if (!visible || !status) return null;

  return (
    <div className="stream-panel">
      <StreamingStatus
        appName="Moonlight"
        installed={status.installed}
        running={streaming}
        installUrl="https://github.com/moonlight-stream/moonlight-qt/releases"
      >
        {status.installed && !streaming && effectiveIp && pairingState === 'idle' && (
          <button className="stream-action-btn primary-action" onClick={handleStream}>
            Start Video Stream
          </button>
        )}
        {streaming && (
          <button className="stream-action-btn danger-text" onClick={handleStop}>
            Stop Video Stream
          </button>
        )}
      </StreamingStatus>

      {/* No host IP — manual entry */}
      {!hostIp && status.installed && (
        <div className="stream-ip-input">
          <input
            type="text" value={manualIp}
            onChange={e => setManualIp(e.target.value)}
            placeholder="Enter host LAN IP (e.g. 192.168.1.5)"
            spellCheck={false}
          />
        </div>
      )}

      {/* Exit code notice */}
      {exitCode !== null && exitCode !== 0 && !streaming && (
        <div className="stream-notice error">Stream ended (exit code {exitCode}). It may need pairing.</div>
      )}

      {/* Pairing flow */}
      {pairingState === 'waiting-pin' && (
        <div className="pair-section">
          <div className="pair-hint">Enter the PIN shown in Sunshine's web UI on the host:</div>
          <div className="pair-input-row">
            <input type="text" value={pin} onChange={e => setPin(e.target.value)} placeholder="PIN" maxLength={6} spellCheck={false} />
            <button className="stream-action-btn primary-action" onClick={handleSendPin} disabled={!pin}>Submit</button>
          </div>
        </div>
      )}
      {pairingState === 'pairing' && <div className="stream-notice">Pairing in progress...</div>}
      {pairingState === 'success' && <div className="stream-notice success">Paired successfully!</div>}
      {pairingState === 'failed' && (
        <div className="stream-notice error">
          Pairing failed: {pairError}
          <button className="stream-action-btn" onClick={() => setPairingState('idle')} style={{ marginLeft: 8 }}>Retry</button>
        </div>
      )}
      {pairingState === 'idle' && status.installed && effectiveIp && !streaming && exitCode !== null && (
        <button className="stream-action-btn" onClick={handlePair}>Pair with Host</button>
      )}
    </div>
  );
}
