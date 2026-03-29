import React, { useRef, useEffect } from 'react';
import { MouseViz, type MouseVizHandle } from './MouseViz';
import { KeyboardViz, type KeyboardVizHandle } from './KeyboardViz';
import { GamepadViz, type GamepadVizHandle } from './GamepadViz';

export function InputMonitor() {
  const mouseRef = useRef<MouseVizHandle>(null);
  const keyboardRef = useRef<KeyboardVizHandle>(null);
  const gamepadRef = useRef<GamepadVizHandle>(null);

  useEffect(() => {
    window.api.onInputViz((d: any) => {
      switch (d.t) {
        case 'mm': mouseRef.current?.showMove(d.dx, d.dy); break;
        case 'mb': mouseRef.current?.showBtn(d.btn, d.down); break;
        case 'mw': mouseRef.current?.showWheel(d.delta); break;
        case 'k': keyboardRef.current?.showKey(d.vk, d.down); break;
        case 'gp': gamepadRef.current?.showGamepad(d.buttons, d.axes, d.triggers); break;
      }
    });
  }, []);

  return (
    <div className="input-monitor">
      <label>INPUT MONITOR</label>
      <MouseViz ref={mouseRef} />
      <KeyboardViz ref={keyboardRef} />
      <GamepadViz ref={gamepadRef} />
    </div>
  );
}
