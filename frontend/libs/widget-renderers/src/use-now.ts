import { useEffect, useState } from "react";

/** Quiet this long and the last value is dimmed and marked, not passed off as live. */
export const STALE_VALUE_AFTER_MS = 3000;

/**
 * A clock that re-renders on its own.
 *
 * Age read during render freezes exactly when it matters: the publisher stops, nothing re-renders, and
 * the widget keeps showing the last reading as if it had just arrived.
 */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/** True when the newest sample is old enough that it must not be read as the robot's current state. */
export function isSampleStale(receivedAt: string | undefined, now: number): boolean {
  if (!receivedAt) {
    return false;
  }
  const time = Date.parse(receivedAt);
  return Number.isFinite(time) && now - time > STALE_VALUE_AFTER_MS;
}
