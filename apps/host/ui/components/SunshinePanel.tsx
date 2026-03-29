import React, { useState, useEffect, useCallback } from 'react';
import { StreamingStatus } from '@inputshare/ui';

interface SunshineStatus {
  installed: boolean;
  exePath: string | null;
  serviceRunning: boolean;
  apiReachable: boolean;
  webUiUrl: string;
}

export function SunshinePanel() {
  const [status, setStatus] = useState<SunshineStatus | null>(null);
  const [actionPending, setActionPending] = useState(false);

  useEffect(() => {
    (window as any).api.sunshineDetect().then(setStatus);
    const interval = setInterval(() => {
      (window as any).api.sunshineStatus().then(setStatus);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleStartService = useCallback(async () => {
    setActionPending(true);
    await (window as any).api.sunshineStartService();
    setTimeout(async () => {
      setStatus(await (window as any).api.sunshineStatus());
      setActionPending(false);
    }, 2000);
  }, []);

  const handleStopService = useCallback(async () => {
    setActionPending(true);
    await (window as any).api.sunshineStopService();
    setTimeout(async () => {
      setStatus(await (window as any).api.sunshineStatus());
      setActionPending(false);
    }, 2000);
  }, []);

  const handleOpenWebUI = useCallback(() => {
    (window as any).api.sunshineOpenWebUI();
  }, []);

  if (!status) return null;

  return (
    <div className="sunshine-panel">
      <StreamingStatus
        appName="Sunshine"
        installed={status.installed}
        running={status.serviceRunning}
        installUrl="https://github.com/LizardByte/Sunshine/releases"
      >
        {status.installed && !status.serviceRunning && (
          <button className="stream-action-btn" disabled={actionPending} onClick={handleStartService}>
            Start Service
          </button>
        )}
        {status.serviceRunning && (
          <>
            <button className="stream-action-btn" onClick={handleOpenWebUI}>Open Web UI</button>
            <button className="stream-action-btn danger-text" disabled={actionPending} onClick={handleStopService}>
              Stop
            </button>
          </>
        )}
      </StreamingStatus>
      {status.serviceRunning && (
        <div className="sunshine-hint">Sunshine is ready for Moonlight clients to connect</div>
      )}
    </div>
  );
}
