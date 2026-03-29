import React, { useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import { VK_NAMES } from '@inputshare/shared';

export interface KeyboardVizHandle {
  showKey: (vk: number, down: boolean) => void;
}

export const KeyboardViz = forwardRef<KeyboardVizHandle>(function KeyboardViz(_props, ref) {
  const gridRef = useRef<HTMLDivElement>(null);
  const activeKeysRef = useRef(new Map<number, HTMLElement>());

  const showKey = useCallback((vk: number, down: boolean) => {
    const grid = gridRef.current; if (!grid) return;
    const map = activeKeysRef.current;
    const name = VK_NAMES[vk] || ('0x' + vk.toString(16).toUpperCase());
    if (down) {
      if (map.has(vk)) return;
      const el = document.createElement('div');
      el.className = 'key-cell active'; el.textContent = name;
      grid.appendChild(el); map.set(vk, el);
    } else {
      const el = map.get(vk);
      if (el) { el.classList.remove('active'); el.classList.add('released'); map.delete(vk); setTimeout(() => el.remove(), 300); }
    }
  }, []);

  useImperativeHandle(ref, () => ({ showKey }), [showKey]);

  return (
    <div className="viz-section">
      <div className="viz-label">Keyboard</div>
      <div className="key-grid" ref={gridRef} />
    </div>
  );
});
