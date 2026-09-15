import { useEffect, useRef, useState } from "react";

export const SCAN_TARGET_SELECTOR =
  'button:not([disabled]), [role="application"], [role="slider"]:not([aria-disabled="true"])';

export type SwitchScanningOptions = {
  enabled: boolean;
  /** Milliseconds the highlight rests on each target. */
  periodMs: number;
  /** The container whose controls are scanned. */
  rootRef: { current: HTMLElement | null };
  /** Re-reads the target list when this changes (screen switches, latch state). */
  revision: unknown;
};

export type SwitchScanningState = {
  /** Index of the lit target, or -1 while nothing is scanning. */
  index: number;
  targetCount: number;
};

/**
 * Walks a highlight across the screen's controls; any switch fires the lit one.
 *
 * The switch is deliberately broad -- Space, Enter, or a tap anywhere outside a
 * control -- because a switch box, a sip-puff and a button all present as one
 * of those. The target list is read from the DOM rather than from the widget
 * model, so every control a widget renders is scannable by construction: the
 * spec's rule that a scan set dropping an axis is worse than no scan at all.
 */
export function useSwitchScanning(options: SwitchScanningOptions): SwitchScanningState {
  const { enabled, periodMs, rootRef, revision } = options;
  const [index, setIndex] = useState(-1);
  const [targetCount, setTargetCount] = useState(0);
  const targetsRef = useRef<HTMLElement[]>([]);
  // The ref is the source of truth inside the loop; state only informs the UI,
  // and a deferred render must never make the highlight skip a target.
  const indexRef = useRef(-1);

  useEffect(() => {
    // Read so the dependency is real: a screen switch changes the target list
    // without changing anything else the effect closes over.
    void revision;
    const root = rootRef.current;
    if (!enabled || !root) {
      setIndex(-1);
      setTargetCount(0);
      return;
    }

    const readTargets = () => {
      const targets = [...root.querySelectorAll<HTMLElement>(SCAN_TARGET_SELECTOR)].filter(
        (element) => element.offsetParent !== null,
      );
      targetsRef.current = targets;
      setTargetCount(targets.length);
      return targets;
    };

    const paint = (nextIndex: number) => {
      for (const [position, target] of targetsRef.current.entries()) {
        target.toggleAttribute("data-scan-lit", position === nextIndex);
      }
    };

    readTargets();
    indexRef.current = targetsRef.current.length > 0 ? 0 : -1;
    setIndex(indexRef.current);
    paint(indexRef.current);

    const advance = () => {
      const targets = readTargets();
      if (targets.length === 0) {
        indexRef.current = -1;
        setIndex(-1);
        return;
      }
      const nextIndex = (indexRef.current + 1) % targets.length;
      indexRef.current = nextIndex;
      setIndex(nextIndex);
      paint(nextIndex);
    };

    const fire = () => {
      const target = targetsRef.current[indexRef.current];
      target?.click();
      target?.focus();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== " " && event.key !== "Enter") {
        return;
      }
      event.preventDefault();
      fire();
    };

    const onPointerDown = (event: PointerEvent) => {
      // A tap on a control is a direct hit, not a switch press. The target is
      // not always an Element (a tap landing on the window itself is not).
      const target = event.target;
      if (target instanceof Element && target.closest(SCAN_TARGET_SELECTOR)) {
        return;
      }
      fire();
    };

    const timer = window.setInterval(advance, periodMs);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
      for (const target of targetsRef.current) {
        target.removeAttribute("data-scan-lit");
      }
    };
  }, [enabled, periodMs, rootRef, revision]);

  return { index, targetCount };
}
