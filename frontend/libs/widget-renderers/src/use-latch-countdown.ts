import { useEffect, useRef, useState } from "react";

/** A latched command never outlives the operator's attention. */
export const LATCH_EXPIRY_MS = 15000;
/** The last seconds before the release are counted down, so it never comes as a surprise. */
const WARN_MS = 5000;

/**
 * Releases a latched control after `expiryMs` without input, and returns the seconds left once the release is
 * near, null before that. Keyed on `revision` (operator input), so re-renders from scanning or telemetry do not
 * restart the window. A latched Snake or pad used to let go in silence.
 */
export function useLatchCountdown(
  active: boolean,
  revision: unknown,
  onExpire: () => void,
  expiryMs = LATCH_EXPIRY_MS,
): number | null {
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    void revision;
    setSecondsLeft(null);
    if (!active) {
      return;
    }
    const startedAt = Date.now();
    const expiry = window.setTimeout(() => {
      setSecondsLeft(null);
      onExpireRef.current();
    }, expiryMs);
    const tick = window.setInterval(() => {
      const left = expiryMs - (Date.now() - startedAt);
      setSecondsLeft(left <= WARN_MS && left > 0 ? Math.ceil(left / 1000) : null);
    }, 250);
    return () => {
      window.clearTimeout(expiry);
      window.clearInterval(tick);
    };
  }, [active, revision, expiryMs]);

  return secondsLeft;
}
