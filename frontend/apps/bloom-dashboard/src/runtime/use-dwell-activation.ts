import { useEffect, useRef } from "react";

import { activateAssistively } from "./assistive-activation";

const TICK_MS = 40;
const DWELL_TARGET_SELECTOR = "button:not([disabled])";
/** Hand tremor and head-pointer jitter stay under this; a traversal does not. */
const REST_TOLERANCE_PX = 6;
/** Leaving a fired control by this much is a deliberate move off it; drifting inside it never is. */
const FIRE_RELEASE_MARGIN_PX = 24;

type FireMemory = { left: number; top: number; right: number; bottom: number; offSince: number | null };

// Shared by every instance: a rest that fired in one surface must not continue onto whatever the next one shows.
let lastFire: FireMemory | null = null;
let enabledInstances = 0;

const distanceOff = (fire: FireMemory, x: number, y: number) =>
  Math.hypot(Math.max(fire.left - x, 0, x - fire.right), Math.max(fire.top - y, 0, y - fire.bottom));

// Released by leaving the control plus a margin, or by staying off it (beyond tremor) for a dwell time.
function releaseFire(x: number, y: number, dwellMs: number) {
  if (!lastFire) {
    return;
  }
  const off = distanceOff(lastFire, x, y);
  const now = Date.now();
  if (off > FIRE_RELEASE_MARGIN_PX || (lastFire.offSince !== null && now - lastFire.offSince >= dwellMs)) {
    lastFire = null;
  } else if (off <= REST_TOLERANCE_PX) {
    lastFire.offSince = null;
  } else {
    lastFire.offSince ??= now;
  }
}

function rememberFire(target: HTMLElement, x: number, y: number) {
  const rect = target.getBoundingClientRect();
  // The pointer is on the control, so the rectangle covers it even where layout reports none.
  lastFire = {
    left: Math.min(rect.left, x),
    top: Math.min(rect.top, y),
    right: Math.max(rect.right, x),
    bottom: Math.max(rect.bottom, y),
    offSince: null,
  };
}

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
 * the hard part. It is a rest, not a passage: moving more than a few pixels
 * inside the control starts the dwell over, so crossing one on the way
 * somewhere else never fires it. Leaving the control cancels and resets -- a
 * half-finished dwell must never complete later on a different target -- and a
 * control only fires once per rest, so lingering does not repeat it.
 */
export function useDwellActivation(options: DwellActivationOptions): void {
  const { activateTarget, enabled, dwellMs, isTargetEnabled, rootRef } = options;
  const activateTargetRef = useRef(activateTarget);
  const isTargetEnabledRef = useRef(isTargetEnabled);
  const targetRef = useRef<HTMLElement | null>(null);
  const startedAtRef = useRef(0);
  // Where the rest began, so crossing the control restarts it instead of
  // completing on the way past.
  const restAtRef = useRef({ x: 0, y: 0 });
  // The action a rest began on. STOP becomes Resume under the pointer, and a
  // rest that started on STOP must never complete as a resume.
  const startActionRef = useRef("");
  const firedRef = useRef(false);
  const pointerRef = useRef({ x: 0, y: 0 });
  activateTargetRef.current = activateTarget;
  isTargetEnabledRef.current = isTargetEnabled;

  useEffect(() => {
    const root = rootRef.current;
    if (!enabled || !root) {
      return;
    }
    enabledInstances += 1;

    const clearTarget = () => {
      targetRef.current?.removeAttribute("data-dwell-active");
      targetRef.current?.style.removeProperty("--bloom-dwell-progress");
      targetRef.current = null;
      firedRef.current = false;
    };

    const beginRest = (target: HTMLElement, event: PointerEvent) => {
      targetRef.current = target;
      target.setAttribute("data-dwell-active", "");
      target.style.setProperty("--bloom-dwell-progress", "0");
      startedAtRef.current = Date.now();
      startActionRef.current = target.dataset.dwellAction ?? "";
      restAtRef.current = { x: event.clientX, y: event.clientY };
    };

    const onPointerMove = (event: PointerEvent) => {
      pointerRef.current = { x: event.clientX, y: event.clientY };
      releaseFire(event.clientX, event.clientY, dwellMs);
      const element = event.target;
      const candidate = element instanceof Element ? element.closest<HTMLElement>(DWELL_TARGET_SELECTOR) : null;
      const target = candidate && (isTargetEnabledRef.current?.(candidate) ?? true) ? candidate : null;
      if (target && target === targetRef.current) {
        const moved = Math.hypot(event.clientX - restAtRef.current.x, event.clientY - restAtRef.current.y);
        if (!firedRef.current && moved > REST_TOLERANCE_PX) {
          // Still travelling across the control, not resting on it.
          beginRest(target, event);
        }
        return;
      }
      if (target === targetRef.current) {
        return;
      }
      clearTarget();
      // Tremor across STOP's edge must not re-arm the Resume that replaced it.
      if (target && lastFire === null) {
        beginRest(target, event);
      }
    };

    const tick = () => {
      const target = targetRef.current;
      if (!target || firedRef.current) {
        return;
      }
      if (!target.isConnected || (target.dataset.dwellAction ?? "") !== startActionRef.current) {
        // The control changed meaning or was replaced mid-rest; start over only
        // when the pointer moves again.
        clearTarget();
        return;
      }
      const elapsed = Date.now() - startedAtRef.current;
      const targetMinimum = Number(target.dataset.dwellMinMs ?? 0);
      const activationMs = Math.max(1, dwellMs, Number.isFinite(targetMinimum) ? targetMinimum : 0);
      const nextProgress = Math.min(1, elapsed / activationMs);
      target.style.setProperty("--bloom-dwell-progress", String(nextProgress));
      // A control not listening yet (Resume's post-latch quiet) fires once it does, while the rest goes on.
      const quietUntil = Number(target.dataset.dwellQuietUntil ?? 0);
      if (nextProgress >= 1 && !(Date.now() < quietUntil)) {
        // The latch may have engaged mid-rest, and a programmatic click ignores
        // the canvas' pointer-events: none, so ask again before firing.
        if (!(isTargetEnabledRef.current?.(target) ?? true)) {
          clearTarget();
          return;
        }
        // Fire once per rest; lingering must not repeat the command.
        firedRef.current = true;
        rememberFire(target, pointerRef.current.x, pointerRef.current.y);
        if (activateTargetRef.current) {
          activateTargetRef.current(target);
        } else {
          activateAssistively(target);
        }
        target.focus();
      }
    };

    const timer = window.setInterval(tick, TICK_MS);
    root.addEventListener("pointermove", onPointerMove);
    const onPointerLeave = (event: PointerEvent) => {
      clearTarget();
      // Out of the window, not onto a sheet that opened over this root.
      if (event.relatedTarget === null) {
        lastFire = null;
      }
    };
    root.addEventListener("pointerleave", onPointerLeave);

    return () => {
      window.clearInterval(timer);
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerleave", onPointerLeave);
      clearTarget();
      enabledInstances -= 1;
      // One surface hands over to the next within a commit; only dwell switched off everywhere forgets.
      queueMicrotask(() => {
        if (enabledInstances === 0) {
          lastFire = null;
        }
      });
    };
  }, [dwellMs, enabled, rootRef]);
}
