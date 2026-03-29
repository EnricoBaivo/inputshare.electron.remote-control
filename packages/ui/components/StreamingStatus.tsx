import React from 'react';

interface StreamingStatusProps {
  appName: string;
  installed: boolean;
  running: boolean;
  installUrl: string;
  children?: React.ReactNode;
}

export function StreamingStatus({ appName, installed, running, installUrl, children }: StreamingStatusProps) {
  const color = running ? 'green' : installed ? 'yellow' : 'red';
  const text = running ? `${appName}: Running` : installed ? `${appName}: Stopped` : `${appName}: Not installed`;

  return (
    <div className="streaming-status">
      <div className="streaming-status-row">
        <span className={`dot ${color}`} />
        <span className="streaming-status-text">{text}</span>
        {!installed && (
          <a className="streaming-install-link" href={installUrl} target="_blank" rel="noreferrer">Download</a>
        )}
      </div>
      {children && <div className="streaming-actions">{children}</div>}
    </div>
  );
}
