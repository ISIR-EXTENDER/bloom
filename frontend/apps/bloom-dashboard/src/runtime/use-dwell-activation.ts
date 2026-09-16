import { useEffect, useRef } from "react";

const TICK_MS = 40;
const DWELL_TARGET_SELECTOR = "button:not([disabled])";

export type DwellActivationOptions = {
  activateTarget?: (target: HTMLElement) => void;
  enabled: boolean;
  /** How long a pointer must rest on a control before it fires. */
  dwellMs: number;
  isTargetEnabled?: (target: HTMLElement) => boolean;
  rootRef: { current: HTMLElement | null };
};

/**
 * Resting on a control fires it; no press required.
 *
 * Serves head pointing, eye tracking, and anyone for whom the click itself is
 * the hard part. Leaving the control cancels and resets -- a half-finished
 * dwell must never complete later on a different target -- and a control only
 * fires once per rest, so lingering does not repeat it.
 */
export function useDwellActivation(options: DwellActivationOptions): void {
  const { activateTarget, enabled, dwellMs, isTargetEnabled, rootRef } = options;
  const activateTargetRef = useRef(activateTarget);
  const isTargetEnabledRef = useRef(isTargetEnabled);
  const targetRef = useRef<HTMLElement | null>(null);
  const startedAtRef = useRef(0);
  const firedRef = useRef(false);
  activateTargetRef.current = activateTarget;
  isTargetEnabledRef.current = isTargetEnabled;

  useEffect(() => {
    const root = rootRef.current;
    if (!enabled || !root) {
      return;
    }

    const clearTarget = () => {
      targetRef.current?.removeAttribute("data-dwell-active");
      targetRef.current?.style.removeProperty("--bloom-dwell-progress");
      targetRef.current = null;
      firedRef.current = false;
    };

    const onPointerMove = (event: PointerEvent) => {
      const element = event.target;
      const candidate = element instanceof Element ? element.closest<HTMLElement>(DWELL_TARGET_SELECTOR) : null;
      const target = candidate && (isTargetEnabledRef.current?.(candidate) ?? true) ? candidate : null;
      if (target === targetRef.current) {
        return;
      }
      clearTarget();
      if (target) {
        targetRef.current = target;
        target.setAttribute("data-dwell-active", "");
        startedAtRef.current = Date.now();
      }
    };

    const tick = () => {
      const target = targetRef.current;
      if (!target || firedRef.current) {
        return;
      }
      const elapsed = Date.now() - startedAtRef.current;
      const targetMinimum = Number(target.dataset.dwellMinMs ?? 0);
      const activationMs = Math.max(1, dwellMs, Number.isFinite(targetMinimum) ? targetMinimum : 0);
      const nextProgress = Math.min(1, elapsed / activationMs);
      target.style.setProperty("--bloom-dwell-progress", String(nextProgress));
      if (nextProgress >= 1) {
        // Fire once per rest; lingering must not repeat the command.
        firedRef.current = true;
        if (activateTargetRef.current) {
          activateTargetRef.current(target);
        } else {
          target.click();
        }
        target.focus();
      }
    };

    const timer = window.setInterval(tick, TICK_MS);
    root.addEventListener("pointermove", onPointerMove);
    root.addEventListener("pointerleave", clearTarget);

    return () => {
      window.clearInterval(timer);
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerleave", clearTarget);
      clearTarget();
    };
  }, [dwellMs, enabled, rootRef]);
}
