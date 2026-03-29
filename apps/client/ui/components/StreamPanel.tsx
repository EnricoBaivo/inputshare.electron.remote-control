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
  const [apps, setApps] = useState<string[]>([]);
  const [selectedApp, setSelectedApp] = useState('Desktop');
  const [loadingApps, setLoadingApps] = useState(false);

  const effectiveIp = hostIp || manualIp || null;
  const api = (window as any).api;

  useEffect(() => {
    api.moonlightDetect().then(setStatus);
  }, []);

  // Fetch available apps when we have an IP and Moonlight is installed
  useEffect(() => {
    if (!effectiveIp || !status?.installed) return;
    setLoadingApps(true);
    api.moonlightListApps(effectiveIp).then((list: string[]) => {
      setApps(list.length > 0 ? list : ['Desktop']);
      if (list.length > 0 && !list.includes(selectedApp)) setSelectedApp(list[0]);
      setLoadingApps(false);
    }).catch(() => {
      setApps(['Desktop']);
      setLoadingApps(false);
    });
  }, [effectiveIp, status?.installed]);

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
    const result = await api.moonlightStream(effectiveIp, selectedApp);
    if (result.ok) setStreaming(true);
  }, [effectiveIp, selectedApp]);

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

  const refreshApps = useCallback(() => {
    if (!effectiveIp) return;
    setLoadingApps(true);
    api.moonlightListApps(effectiveIp).then((list: string[]) => {
      setApps(list.length > 0 ? list : ['Desktop']);
      setLoadingApps(false);
    }).catch(() => setLoadingApps(false));
  }, [effectiveIp]);

  if (!visible || !status) return null;

  return (
    <div className="stream-panel">
      <StreamingStatus
        appName="Moonlight"
        installed={status.installed}
        running={streaming}
        installUrl="https://github.com/moonlight-stream/moonlight-qt/releases"
      >
        {streaming && (
          <button className="stream-action-btn danger-text" onClick={handleStop}>
            Stop Video Stream
          </button>
        )}
      </StreamingStatus>

      {status.installed && !streaming && (
        <div className="stream-controls">
          {/* Host IP — manual entry if not auto-detected */}
          {!hostIp && (
            <div className="stream-ip-input">
              <label className="app-selector-label">Host IP for Moonlight</label>
              <input
                type="text" value={manualIp}
                onChange={e => setManualIp(e.target.value)}
                placeholder="Enter host LAN IP (e.g. 192.168.1.5)"
                spellCheck={false}
              />
            </div>
          )}

          {/* App selector + Start button */}
          {effectiveIp && pairingState === 'idle' && (
            <>
              {apps.length > 0 && (
                <div className="app-selector">
                  <label className="app-selector-label">Stream App</label>
                  <div className="app-selector-row">
                    <select value={selectedApp} onChange={e => setSelectedApp(e.target.value)} disabled={loadingApps}>
                      {apps.map(app => <option key={app} value={app}>{app}</option>)}
                    </select>
                    <button className="stream-action-btn" onClick={refreshApps} disabled={loadingApps} title="Refresh app list">&#x21bb;</button>
                  </div>
                </div>
              )}
              <button className="stream-start-btn" onClick={handleStream}>
                {loadingApps ? 'Loading...' : `Stream ${selectedApp}`}
              </button>
            </>
          )}

          {!effectiveIp && (
            <div className="stream-notice">Enter the host's LAN IP above to start streaming</div>
          )}

          {/* Exit code notice */}
          {exitCode !== null && exitCode !== 0 && (
            <div className="stream-notice error">Stream ended (exit code {exitCode}). It may need pairing.</div>
          )}

          {/* Pair button */}
          {pairingState === 'idle' && effectiveIp && exitCode !== null && (
            <button className="stream-action-btn" onClick={handlePair} style={{ marginTop: 6 }}>Pair with Host</button>
          )}
        </div>
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
    </div>
  );
}
