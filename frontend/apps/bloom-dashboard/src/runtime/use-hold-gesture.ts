import { useCallback, useEffect, useRef, useState } from "react";

const HOLD_TICK_MS = 40;

/**
 * Progress of a deliberate press, 0..1. Any release or leave cancels and
 * resets, so a half-finished press cannot be completed by someone else.
 * Shared by the maintenance hold (1.5s) and the STOP resume hold (1s).
 */
export function useHoldGesture(durationMs: number, onComplete: () => void) {
  const [value, setValue] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const stop = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);
  // Stable, so an effect can cancel a hold when what it would complete has changed.
  const cancel = useCallback(() => {
    stop();
    setValue(0);
  }, [stop]);

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
    cancel,
  };
}
