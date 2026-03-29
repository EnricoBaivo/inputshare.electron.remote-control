import { useEffect, useRef } from 'react';
import { encodeKey, encodeMouseMove, encodeMouseBtn, encodePadState } from '@inputshare/shared';

interface UseGlobalCaptureOptions {
  sendR: (buf: ArrayBuffer) => void;
  sendU: (buf: ArrayBuffer) => void;
  active: boolean;
  onStopped: () => void;
}

export function useGlobalCapture({ sendR, sendU, active, onStopped }: UseGlobalCaptureOptions) {
  const activeRef = useRef(active);
  useEffect(() => { activeRef.current = active; }, [active]);

  useEffect(() => {
    if (!active) return;

    const api = (window as any).api;

    api.onGcKey((data: { vk: number; scan: number; down: boolean }) => {
      if (!activeRef.current) return;
      sendR(encodeKey(data.vk, data.scan, data.down));
    });

    api.onGcMouseMove((data: { dx: number; dy: number }) => {
      if (!activeRef.current) return;
      sendU(encodeMouseMove(data.dx, data.dy));
    });

    api.onGcMouseBtn((data: { button: number; down: boolean }) => {
      if (!activeRef.current) return;
      sendR(encodeMouseBtn(data.button, data.down));
    });

    api.onGcGamepad((data: { index: number; buttons: number; axes: number[]; triggers: number[] }) => {
      if (!activeRef.current) return;
      sendR(encodePadState(
        data.index,
        data.buttons,
        data.axes as [number, number, number, number],
        data.triggers as [number, number],
      ));
    });

    api.onGcStopped(() => {
      onStopped();
    });

    return () => {
      api.removeGcListeners();
    };
  }, [active, sendR, sendU, onStopped]);
}
