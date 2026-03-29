import React from 'react';
import type { LatencyInfo } from '@inputshare/shared';

interface LatencyDetailProps {
  lat: LatencyInfo;
  className?: string;
}

export function LatencyDetail({ lat, className }: LatencyDetailProps) {
  return (
    <div className={`latency-detail ${className || ''}`}>
      <div className="latency-row"><span className="latency-label">Input latency (est.)</span><span className="latency-value">{lat.oneway}</span></div>
      <div className="latency-row"><span className="latency-label">Host processing</span><span className="latency-value">{lat.hostProc}</span></div>
      <div className="latency-row"><span className="latency-label">Avg RTT (10 samples)</span><span className="latency-value">{lat.avgRtt}</span></div>
      <div className="latency-row"><span className="latency-label">Min / Max RTT</span><span className="latency-value">{lat.minmax}</span></div>
    </div>
  );
}
