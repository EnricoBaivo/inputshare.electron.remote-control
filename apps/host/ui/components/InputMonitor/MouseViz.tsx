import React, { useRef, useCallback, useImperativeHandle, forwardRef } from 'react';

export interface MouseVizHandle {
  showMove: (dx: number, dy: number) => void;
  showBtn: (btn: number, down: boolean) => void;
  showWheel: (delta: number) => void;
}

export const MouseViz = forwardRef<MouseVizHandle>(function MouseViz(_props, ref) {
  const dotRef = useRef<HTMLDivElement>(null);
  const wheelRef = useRef<HTMLSpanElement>(null);
  const mouseState = useRef({ x: 0, y: 0, decay: null as ReturnType<typeof setTimeout> | null });
  const wheelTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const showMove = useCallback((dx: number, dy: number) => {
    const dot = dotRef.current; if (!dot) return;
    const s = mouseState.current;
    s.x = Math.max(-1, Math.min(1, s.x + dx * 0.02));
    s.y = Math.max(-1, Math.min(1, s.y + dy * 0.02));
    dot.style.left = (50 + s.x * 40) + '%';
    dot.style.top = (50 + s.y * 40) + '%';
    dot.classList.add('active');
    if (s.decay) clearTimeout(s.decay);
    s.decay = setTimeout(() => {
      s.x *= 0.3; s.y *= 0.3;
      dot.style.left = (50 + s.x * 40) + '%';
      dot.style.top = (50 + s.y * 40) + '%';
      dot.classList.remove('active');
    }, 100);
  }, []);

  const showBtn = useCallback((btn: number, down: boolean) => {
    document.getElementById('mbtn-' + btn)?.classList.toggle('active', down);
  }, []);

  const showWheel = useCallback((delta: number) => {
    const w = wheelRef.current; if (!w) return;
    w.textContent = delta > 0 ? '\u25B2' : '\u25BC';
    w.classList.add('active');
    clearTimeout(wheelTimeoutRef.current);
    wheelTimeoutRef.current = setTimeout(() => w.classList.remove('active'), 200);
  }, []);

  useImperativeHandle(ref, () => ({ showMove, showBtn, showWheel }), [showMove, showBtn, showWheel]);

  return (
    <div className="viz-section">
      <div className="viz-label">Mouse</div>
      <div className="mouse-viz">
        <div className="mouse-buttons">
          <div className="mbtn" id="mbtn-0">L</div>
          <div className="mbtn" id="mbtn-2">M</div>
          <div className="mbtn" id="mbtn-1">R</div>
        </div>
        <div className="mouse-move">
          <div className="mouse-crosshair" />
          <div className="mouse-dot" ref={dotRef} />
        </div>
        <div className="mouse-wheel-viz"><span ref={wheelRef} /></div>
      </div>
    </div>
  );
});
