import { useRef, useCallback } from 'react';
import { encodePadState } from '@inputshare/shared';

const DEADZONE = 0.05;

interface UseGamepadPollOptions {
  sendR: (buf: ArrayBuffer) => void;
  gpRef: React.MutableRefObject<boolean>;
}

export function useGamepadPoll({ sendR, gpRef }: UseGamepadPollOptions) {
  const gamepadRef = useRef<number | null>(null);
  const prevGpRef = useRef(new Map<number, { buttons: number; axes: number[]; triggers: number[] }>());

  const pollGamepads = useCallback(() => {
    if (!gpRef.current) return;
    const gamepads = navigator.getGamepads();
    for (let i = 0; i < gamepads.length; i++) {
      const gp = gamepads[i]; if (!gp) continue;
      let buttons = 0;
      for (let b = 0; b < Math.min(gp.buttons.length, 17); b++) {
        if (gp.buttons[b].pressed) buttons |= (1 << b);
      }
      const axes: [number, number, number, number] = [gp.axes[0]||0, gp.axes[1]||0, gp.axes[2]||0, gp.axes[3]||0];
      const triggers: [number, number] = [gp.buttons[6]?.value||0, gp.buttons[7]?.value||0];
      const ca = axes.map(v => Math.abs(v) < DEADZONE ? 0 : v) as [number, number, number, number];
      const ct = triggers.map(v => v < DEADZONE ? 0 : v) as [number, number];
      const prev = prevGpRef.current.get(i);
      let changed = !prev || prev.buttons !== buttons;
      if (!changed && prev) {
        for (let j = 0; j < 4; j++) if (Math.abs(prev.axes[j] - ca[j]) > 0.01) { changed = true; break; }
        if (!changed) for (let j = 0; j < 2; j++) if (Math.abs(prev.triggers[j] - ct[j]) > 0.01) { changed = true; break; }
      }
      if (changed) {
        sendR(encodePadState(i, buttons, ca, ct));
        prevGpRef.current.set(i, { buttons, axes: [...ca], triggers: [...ct] });
      }
    }
  }, [sendR, gpRef]);

  const startGamepadPoll = useCallback(() => {
    const poll = () => {
      pollGamepads();
      gamepadRef.current = requestAnimationFrame(poll);
    };
    gamepadRef.current = requestAnimationFrame(poll);
  }, [pollGamepads]);

  const stopGamepadPoll = useCallback(() => {
    if (gamepadRef.current) { cancelAnimationFrame(gamepadRef.current); gamepadRef.current = null; }
  }, []);

  return { startGamepadPoll, stopGamepadPoll };
}
