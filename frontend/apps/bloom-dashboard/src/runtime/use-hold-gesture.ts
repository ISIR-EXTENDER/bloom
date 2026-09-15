import { useEffect, useRef, useState } from "react";

const HOLD_TICK_MS = 40;

/**
 * Progress of a deliberate press toward an action, 0..1.
 *
 * The hold is the substance, not decoration: it cannot be done by brushing the
 * glass, which is how a wheelchair-mounted arm gets driven by someone whose
 * eyes are on the gripper rather than the screen. Any release or leave cancels
 * and resets to zero, so a half-finished press cannot be completed later by
 * someone who did not start it. The timer is cleared on unmount because it
 * outlives the component otherwise.
 *
 * Shared by the maintenance hold (1.5s) and the STOP resume hold (1s), so the
 * two deliberate gestures in the runtime cannot drift apart in behaviour.
 */
export function useHoldGesture(durationMs: number, onComplete: () => void) {
  const [value, setValue] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const stop = () => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
      }
    },
    [],
  );

  return {
    value,
    start: () => {
      stop();
      const startedAt = Date.now();
      timerRef.current = setInterval(() => {
        const progress = Math.min(1, (Date.now() - startedAt) / durationMs);
        setValue(progress);
        if (progress >= 1) {
          stop();
          setValue(0);
          onCompleteRef.current();
        }
      }, HOLD_TICK_MS);
    },
    cancel: () => {
      stop();
      setValue(0);
    },
  };
}
