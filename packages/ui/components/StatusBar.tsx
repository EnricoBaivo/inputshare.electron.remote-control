import React from 'react';

interface StatusBarProps {
  color: string;
  text: string;
  rtt?: string;
  compact?: boolean;
  className?: string;
}

export function StatusBar({ color, text, rtt, compact, className }: StatusBarProps) {
  return (
    <div className={`status-bar ${compact ? 'compact' : ''} ${className || ''}`}>
      <span className={`dot ${color}`} />
      <span>{text}</span>
      {rtt !== undefined && <span className="rtt">{rtt}</span>}
    </div>
  );
}
