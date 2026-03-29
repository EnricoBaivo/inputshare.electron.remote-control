import { useState, useCallback, useRef } from 'react';
import type { LatencyInfo } from '@inputshare/shared';

const RTT_WINDOW = 10;

export function useLatency() {
  const [rttText, setRttText] = useState('');
  const [lat, setLat] = useState<LatencyInfo>({ oneway: '--', hostProc: '--', avgRtt: '--', minmax: '--' });
  const rttHistRef = useRef<number[]>([]);

  const updateLatency = useCallback((rttMs: number, hostProcessingUs: number) => {
    const hist = rttHistRef.current;
    hist.push(rttMs);
    if (hist.length > RTT_WINDOW) hist.shift();
    setRttText(rttMs.toFixed(1) + ' ms');
    const avg = hist.reduce((a, b) => a + b, 0) / hist.length;
    const min = Math.min(...hist);
    const max = Math.max(...hist);
    setLat({
      oneway: (rttMs / 2).toFixed(1) + ' ms',
      hostProc: (hostProcessingUs / 1000).toFixed(2) + ' ms',
      avgRtt: avg.toFixed(1) + ' ms',
      minmax: min.toFixed(1) + ' / ' + max.toFixed(1) + ' ms',
    });
  }, []);

  return { rttText, lat, updateLatency };
}
