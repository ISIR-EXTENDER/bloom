import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { activeScanPeriodMs, subscribeSwitchPresses } from "./use-switch-scanning";

/** How long an armed assistive press waits for its confirming press. */
const ASSISTIVE_CONFIRM_WINDOW_MS = 8000;
/** The confirming press comes at least a scan period, and never less than this, after the arming one. */
const ASSISTIVE_CONFIRM_SETTLE_MS = 600;
/** After a latch, the switch must rest this long (or two scan periods) before Resume listens. */
const ASSISTIVE_LATCH_QUIET_MS = 1500;

const quietMs = () => Math.max(ASSISTIVE_LATCH_QUIET_MS, 2 * activeScanPeriodMs());
const settleMs = () => Math.max(ASSISTIVE_CONFIRM_SETTLE_MS, activeScanPeriodMs());

/**
 * A switch or dwell activation cannot hold, and one press must not restart the robot: the first arms, the second
 * within the window confirms. Shared by Resume and the tour's practice Resume, so the tour teaches the real thing.
 * `latchKey` changes with each latch: the presses that stopped the robot must not also resume it.
 */
export function useAssistiveConfirm(onConfirm: () => void, disabled = false, latchKey?: unknown) {
  const [armed, setArmed] = useState(false);
  const armedRef = useRef(false);
  const armedAtRef = useRef(0);
  const pressesSinceArmRef = useRef(0);
  const quietFromRef = useRef(Date.now());
  const timerRef = useRef<number | null>(null);
  // True while the quiet window refuses presses, so Resume can say to let go instead of ignoring them silently.
  const [locked, setLocked] = useState(true);
  // When the window ends, as a time: a dwell that completes inside it waits for it instead of being eaten.
  const [quietUntil, setQuietUntil] = useState(() => Date.now() + quietMs());
  const lockTimerRef = useRef<number | null>(null);
  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;

  const disarm = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    armedRef.current = false;
    setArmed(false);
  }, []);

  const trackLock = useCallback(() => {
    if (lockTimerRef.current !== null) {
      window.clearTimeout(lockTimerRef.current);
      lockTimerRef.current = null;
    }
    const until = quietFromRef.current + quietMs();
    const remaining = until - Date.now();
    setQuietUntil(until);
    setLocked(remaining > 0);
    if (remaining > 0) {
      lockTimerRef.current = window.setTimeout(trackLock, remaining);
    }
  }, []);

  useLayoutEffect(() => {
    void latchKey;
    quietFromRef.current = Date.now();
    trackLock();
  }, [latchKey, trackLock]);

  // A press inside the quiet window starts it again: a panicking operator hammering the switch never resumes.
  useEffect(
    () =>
      subscribeSwitchPresses(() => {
        const now = Date.now();
        if (now - quietFromRef.current < quietMs()) {
          quietFromRef.current = now;
          trackLock();
        }
        pressesSinceArmRef.current += 1;
      }),
    [trackLock],
  );

  // A confirm armed before the control was disabled must not survive to complete once it is enabled again.
  useEffect(() => {
    if (disabled) {
      disarm();
    }
  }, [disabled, disarm]);

  useEffect(
    () => () => {
      for (const timer of [timerRef.current, lockTimerRef.current]) {
        if (timer !== null) {
          window.clearTimeout(timer);
        }
      }
    },
    [],
  );

  const activate = () => {
    const now = Date.now();
    if (disabled || now - quietFromRef.current < quietMs()) {
      return;
    }
    // The confirming press is the only one since arming (a bounce is a second press), a scan period later.
    if (armedRef.current && now - armedAtRef.current >= settleMs() && pressesSinceArmRef.current <= 1) {
      disarm();
      onConfirmRef.current();
      return;
    }
    // Too soon, or another press came in between: this press arms afresh.
    disarm();
    armedAtRef.current = now;
    pressesSinceArmRef.current = 0;
    armedRef.current = true;
    setArmed(true);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      armedRef.current = false;
      setArmed(false);
    }, ASSISTIVE_CONFIRM_WINDOW_MS);
  };

  return { activate, armed, disarm, locked, quietUntil };
}
