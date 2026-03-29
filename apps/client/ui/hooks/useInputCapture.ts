import { useRef, useCallback } from 'react';
import { VK_MAP, encodeKey, encodeMouseMove, encodeMouseBtn, encodeMouseWheel } from '@inputshare/shared';

interface UseInputCaptureOptions {
  sendR: (buf: ArrayBuffer) => void;
  sendU: (buf: ArrayBuffer) => void;
  kbRef: React.MutableRefObject<boolean>;
}

export function useInputCapture({ sendR, sendU, kbRef }: UseInputCaptureOptions) {
  const heldKeysRef = useRef(new Map<string, { vk: number; scan: number }>());
  const heldBtnsRef = useRef(new Set<number>());

  const onKeyDown = useCallback((e: KeyboardEvent) => {
    if (!kbRef.current) return;
    if (e.code === 'Escape') return;
    e.preventDefault(); e.stopPropagation();
    const m = VK_MAP[e.code]; if (!m) return;
    if (!heldKeysRef.current.has(e.code)) {
      heldKeysRef.current.set(e.code, m);
      sendR(encodeKey(m.vk, m.scan, true));
    }
  }, [sendR, kbRef]);

  const onKeyUp = useCallback((e: KeyboardEvent) => {
    if (e.code === 'Escape') return;
    const held = heldKeysRef.current;
    if (!held.has(e.code)) return;
    e.preventDefault(); e.stopPropagation();
    const m = held.get(e.code)!;
    held.delete(e.code);
    sendR(encodeKey(m.vk, m.scan, false));
  }, [sendR]);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!kbRef.current || !document.pointerLockElement) return;
    const dx = e.movementX, dy = e.movementY;
    if (dx === 0 && dy === 0) return;
    sendU(encodeMouseMove(dx, dy));
  }, [sendU, kbRef]);

  const onMouseDown = useCallback((e: MouseEvent) => {
    if (!kbRef.current || !document.pointerLockElement) return;
    e.preventDefault();
    heldBtnsRef.current.add(e.button);
    sendR(encodeMouseBtn(e.button, true));
  }, [sendR, kbRef]);

  const onMouseUp = useCallback((e: MouseEvent) => {
    if (!heldBtnsRef.current.has(e.button)) return;
    e.preventDefault();
    heldBtnsRef.current.delete(e.button);
    sendR(encodeMouseBtn(e.button, false));
  }, [sendR]);

  const onWheel = useCallback((e: WheelEvent) => {
    if (!kbRef.current || !document.pointerLockElement) return;
    e.preventDefault();
    const delta = Math.round(-e.deltaY / Math.abs(e.deltaY || 1) * 120);
    if (delta !== 0) sendR(encodeMouseWheel(delta));
  }, [sendR, kbRef]);

  const releaseAllHeld = useCallback(() => {
    for (const [, m] of heldKeysRef.current) sendR(encodeKey(m.vk, m.scan, false));
    heldKeysRef.current.clear();
    for (const btn of heldBtnsRef.current) sendR(encodeMouseBtn(btn, false));
    heldBtnsRef.current.clear();
  }, [sendR]);

  return { onKeyDown, onKeyUp, onMouseMove, onMouseDown, onMouseUp, onWheel, releaseAllHeld };
}
