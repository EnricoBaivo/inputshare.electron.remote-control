import React, { useRef, useCallback, useImperativeHandle, forwardRef } from 'react';

export interface GamepadVizHandle {
  showGamepad: (buttons: number, axes: number[], triggers: number[]) => void;
}

export const GamepadViz = forwardRef<GamepadVizHandle>(function GamepadViz(_props, ref) {
  const stickLRef = useRef<HTMLDivElement>(null);
  const stickRRef = useRef<HTMLDivElement>(null);
  const triggerLRef = useRef<HTMLDivElement>(null);
  const triggerRRef = useRef<HTMLDivElement>(null);

  const showGamepad = useCallback((buttons: number, axes: number[], triggers: number[]) => {
    const sl = stickLRef.current; const sr = stickRRef.current;
    if (sl) { sl.style.left = (50 + axes[0] * 40) + '%'; sl.style.top = (50 + axes[1] * 40) + '%'; }
    if (sr) { sr.style.left = (50 + axes[2] * 40) + '%'; sr.style.top = (50 + axes[3] * 40) + '%'; }
    const tl = triggerLRef.current; const tr = triggerRRef.current;
    if (tl) tl.style.height = (triggers[0] * 100) + '%';
    if (tr) tr.style.height = (triggers[1] * 100) + '%';
    document.querySelectorAll('.gp-btn[data-b]').forEach(el => {
      const b = parseInt(el.getAttribute('data-b')!);
      el.classList.toggle('active', !!(buttons & (1 << b)));
    });
  }, []);

  useImperativeHandle(ref, () => ({ showGamepad }), [showGamepad]);

  return (
    <div className="viz-section">
      <div className="viz-label">Gamepad</div>
      <div className="gamepad-viz">
        <div className="stick-area">
          <div className="stick-label">L</div>
          <div className="stick-box"><div className="stick-pos" ref={stickLRef} /></div>
          <div className="trigger-bar"><div className="trigger-fill" ref={triggerLRef} /></div>
        </div>
        <div className="gp-buttons">
          <div className="gp-btn" data-b="12">^</div>
          <div className="gp-btn-row">
            <div className="gp-btn" data-b="14">&lt;</div>
            <div className="gp-btn" data-b="13">v</div>
            <div className="gp-btn" data-b="15">&gt;</div>
          </div>
          <div className="gp-btn-spacer" />
          <div className="gp-btn gp-a" data-b="0">A</div>
          <div className="gp-btn gp-b" data-b="1">B</div>
          <div className="gp-btn gp-x" data-b="2">X</div>
          <div className="gp-btn gp-y" data-b="3">Y</div>
          <div className="gp-btn" data-b="4">LB</div>
          <div className="gp-btn" data-b="5">RB</div>
          <div className="gp-btn" data-b="8">Bk</div>
          <div className="gp-btn" data-b="9">St</div>
          <div className="gp-btn" data-b="10">L3</div>
          <div className="gp-btn" data-b="11">R3</div>
        </div>
        <div className="stick-area">
          <div className="stick-label">R</div>
          <div className="stick-box"><div className="stick-pos" ref={stickRRef} /></div>
          <div className="trigger-bar"><div className="trigger-fill" ref={triggerRRef} /></div>
        </div>
      </div>
    </div>
  );
});
