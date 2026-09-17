import { useEffect, useState } from "react";

const SETTLE_MS = 400;

/**
 * The value a live region announces: the last one, once it stops changing.
 *
 * A pad or axis streams at up to 30 Hz. Piped straight into `aria-live`, that
 * is a screen reader talking over itself for as long as a hand is on the glass,
 * and the number it finally says is stale. Waiting for the rest announces where
 * the control actually ended up.
 */
export function useSettledAnnouncement(value: string, settleMs: number = SETTLE_MS): string {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), settleMs);
    return () => window.clearTimeout(timer);
  }, [settleMs, value]);

  return settled;
}
