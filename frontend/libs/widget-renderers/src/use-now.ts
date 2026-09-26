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
  const arrived = localReceivedAt(receivedAt);
  return arrived !== undefined && now - arrived > STALE_VALUE_AFTER_MS;
}

// The backend's clock and the tablet's may disagree by minutes. Each stamp is timed once, on arrival; one
// first met after newer ones (a remounted widget) is placed by the newest stamp's offset, unless that
// stream went quiet, which is how a backend whose clock stepped back, or another backend, looks.
const arrivals = new Map<string, number>();
const MAX_TRACKED_STAMPS = 4096;
let newestStamp = Number.NEGATIVE_INFINITY;
let clockOffset = 0;
let anchoredAt = Number.NEGATIVE_INFINITY;

/** A backend `received_at` on this tablet's clock: when the sample arrived here, in ms since epoch. */
export function localReceivedAt(receivedAt: string | undefined): number | undefined {
  if (!receivedAt) {
    return undefined;
  }
  const known = arrivals.get(receivedAt);
  if (known !== undefined) {
    return known;
  }
  const stamp = Date.parse(receivedAt);
  if (!Number.isFinite(stamp)) {
    return undefined;
  }
  const now = Date.now();
  if (stamp > newestStamp || now - anchoredAt > STALE_VALUE_AFTER_MS) {
    newestStamp = stamp;
    clockOffset = now - stamp;
    anchoredAt = now;
  }
  const arrived = stamp + clockOffset;
  arrivals.set(receivedAt, arrived);
  if (arrivals.size > MAX_TRACKED_STAMPS) {
    arrivals.delete(arrivals.keys().next().value as string);
  }
  return arrived;
}
