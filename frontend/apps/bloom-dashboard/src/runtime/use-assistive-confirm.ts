import { useCallback, useEffect, useRef, useState } from "react";

/** How long an armed assistive press waits for its confirming press. */
const ASSISTIVE_CONFIRM_WINDOW_MS = 8000;
/** A second assistive press closer than this to the arming one is the same press. */
const ASSISTIVE_CONFIRM_SETTLE_MS = 600;

/**
 * A switch or dwell activation cannot hold, and one press must not restart the robot: the first arms, the second
 * within the window confirms. Shared by Resume and the tour's practice Resume, so the tour teaches the real thing.
 */
export function useAssistiveConfirm(onConfirm: () => void, disabled = false) {
  const [armed, setArmed] = useState(false);
  const armedAtRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;

  const disarm = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setArmed(false);
  }, []);

  // A confirm armed before the control was disabled must not survive to complete once it is enabled again.
  useEffect(() => {
    if (disabled) {
      disarm();
    }
  }, [disabled, disarm]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    },
    [],
  );

  const activate = () => {
    if (disabled) {
      return;
    }
    if (armed) {
      // A bouncing switch pressed twice within milliseconds; that is one press, not a confirmation.
      if (Date.now() - armedAtRef.current < ASSISTIVE_CONFIRM_SETTLE_MS) {
        return;
      }
      disarm();
      onConfirmRef.current();
      return;
    }
    armedAtRef.current = Date.now();
    setArmed(true);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setArmed(false);
    }, ASSISTIVE_CONFIRM_WINDOW_MS);
  };

  return { activate, armed, disarm };
}
