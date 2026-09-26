import { useEffect, useRef, useState } from "react";

/** A latched command never outlives the operator's attention. */
export const LATCH_EXPIRY_MS = 15000;
/** The last seconds before the release are counted down, so it never comes as a surprise. */
const WARN_MS = 5000;

export type LatchCountdown = {
  /** Seconds before the release once it is near, null before that. */
  secondsLeft: number | null;
  /** A deliberate "keep going": restarts the window without changing what is held. */
  keep: () => void;
};

/**
 * Releases a latched control after `expiryMs` without input, and counts the last seconds down. Keyed on
 * `revision` (operator input), so re-renders from scanning or telemetry do not restart the window. A latched
 * Snake or pad used to let go in silence, and keeping it meant moving it.
 */
export function useLatchCountdown(
  active: boolean,
  revision: unknown,
  onExpire: () => void,
  expiryMs = LATCH_EXPIRY_MS,
): LatchCountdown {
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [kept, setKept] = useState(0);

  useEffect(() => {
    void revision;
    void kept;
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
  }, [active, revision, kept, expiryMs]);

  return { keep: () => setKept((count) => count + 1), secondsLeft };
}
