import { useCallback, useEffect, useRef, useState } from "react";

import { activateAssistively } from "./assistive-activation";

/** Only click-operable controls; the switch bar itself is never a target. */
export const SCAN_TARGET_SELECTOR = "button:not([disabled]):not([data-scan-switch])";

/**
 * Controls that open every cycle, ahead of the screen, wherever they are drawn.
 * STOP carries it: last in a 23-target cycle it was 31 s away at 1400 ms.
 */
const MAX_ARMED_HOLDS = 2;
const SCAN_PRIORITY_SELECTOR = `${SCAN_TARGET_SELECTOR}[data-scan-priority]`;

export type SwitchScanningOptions = {
  /** Fires the lit target; without one the target is clicked. */
  activateTarget?: (target: HTMLElement) => void;
  enabled: boolean;
  /** Restricts scanning further when only a safe subset may be operated. */
  isTargetEnabled?: (target: HTMLElement) => boolean;
  /** Milliseconds the highlight rests on each target. */
  periodMs: number;
  /** The container whose controls are scanned. */
  rootRef: { current: HTMLElement | null };
  /** Re-reads the target list when this changes (screen switches, latch state). */
  revision: unknown;
};

export type SwitchScanningState = {
  /** Fire and focus the currently highlighted scan target. */
  activateCurrent: () => void;
  /** Index of the lit target, or -1 while nothing is scanning. */
  index: number;
  targetCount: number;
};

/**
 * Walks a highlight across the screen's controls; any switch fires the lit one.
 *
 * The switch is deliberately broad -- Space, Enter, or a tap anywhere outside a
 * control -- because a switch box, a sip-puff and a button all present as one
 * of those. Targets are read from the DOM, so a widget is scannable exactly
 * when it renders buttons: pads and sliders switch to step targets under this
 * preset, because a click on a pad moves nothing.
 */
export function useSwitchScanning(options: SwitchScanningOptions): SwitchScanningState {
  const { activateTarget, enabled, isTargetEnabled, periodMs, rootRef, revision } = options;
  const [index, setIndex] = useState(-1);
  const [targetCount, setTargetCount] = useState(0);
  const targetsRef = useRef<HTMLElement[]>([]);
  const activateTargetRef = useRef(activateTarget);
  const isTargetEnabledRef = useRef(isTargetEnabled);
  activateTargetRef.current = activateTarget;
  isTargetEnabledRef.current = isTargetEnabled;
  // The ref is the source of truth inside the loop; state only informs the UI,
  // and a deferred render must never make the highlight skip a target.
  const indexRef = useRef(-1);
  const armedHoldsRef = useRef(0);
  const activateCurrent = useCallback(() => {
    const target = targetsRef.current[indexRef.current];
    if (!target) {
      return;
    }
    // Ask again at fire time, as the dwell path does: the latch may have engaged since this target was
    // read, and a stopped control is only aria-disabled, so a programmatic click would still reach it.
    if (!(isTargetEnabledRef.current?.(target) ?? true)) {
      return;
    }
    if (activateTargetRef.current) {
      activateTargetRef.current(target);
    } else {
      activateAssistively(target);
    }
    target.focus();
  }, []);

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

    // Scanning a dialog is the dialog's own business; only a root outside one
    // keeps its hands off the keys and taps that belong to it.
    const rootIsModal = isInsideModal(root);

    const readTargets = () => {
      // Clear the outgoing set first. paint() only touches targets still in the list, so one that left it --
      // a command button disabled by its own press, a stepper at its limit -- kept the highlight, and the
      // operator saw two lit controls while the switch fired the other one.
      for (const previous of targetsRef.current) {
        previous.removeAttribute("data-scan-lit");
      }
      // Priority targets are read from the document: STOP is runtime chrome and
      // sits outside the scanned screen, settings panel or dialog.
      const priority = [...document.querySelectorAll<HTMLElement>(SCAN_PRIORITY_SELECTOR)];
      const rest = [...root.querySelectorAll<HTMLElement>(SCAN_TARGET_SELECTOR)].filter(
        (element) => !priority.includes(element),
      );
      const targets = [...priority, ...rest].filter(
        (element) => element.offsetParent !== null && (isTargetEnabledRef.current?.(element) ?? true),
      );
      targetsRef.current = targets;
      setTargetCount(targets.length);
      return targets;
    };

    const paint = (nextIndex: number) => {
      for (const [position, target] of targetsRef.current.entries()) {
        target.toggleAttribute("data-scan-lit", position === nextIndex);
      }
      targetsRef.current[nextIndex]?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    };

    readTargets();
    indexRef.current = targetsRef.current.length > 0 ? 0 : -1;
    setIndex(indexRef.current);
    paint(indexRef.current);

    const advance = () => {
      // An armed control (Go home waiting for its second press) keeps the highlight until it fires or disarms: the
      // confirming press otherwise landed on whatever was lit next.
      // Two periods at most: a button that stays armed until pressed must never keep the operator from STOP.
      const lit = targetsRef.current[indexRef.current];
      if (lit?.isConnected && lit.getAttribute("data-armed") === "true" && armedHoldsRef.current < MAX_ARMED_HOLDS) {
        armedHoldsRef.current += 1;
        return;
      }
      armedHoldsRef.current = 0;
      const previous = targetsRef.current;
      const targets = readTargets();
      if (targets.length === 0) {
        indexRef.current = -1;
        setIndex(-1);
        return;
      }
      // A control that appears for a few seconds (Keep going before a latch lets go) is lit next, not after a
      // whole cycle a one-switch operator could not finish in time.
      const urgent = targets.findIndex(
        (target) => target.hasAttribute("data-scan-urgent") && !previous.includes(target),
      );
      const nextIndex = urgent >= 0 ? urgent : (indexRef.current + 1) % targets.length;
      indexRef.current = nextIndex;
      setIndex(nextIndex);
      paint(nextIndex);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== " " && event.key !== "Enter") {
        return;
      }
      // A key meant for an open dialog belongs to the dialog, never to the
      // control highlighted behind it.
      if (!rootIsModal && isInsideModal(event.target)) {
        return;
      }
      event.preventDefault();
      activateCurrent();
    };

    const onPointerDown = (event: PointerEvent) => {
      // A tap on a control is a direct hit, not a switch press. The target is
      // not always an Element (a tap landing on the window itself is not).
      const target = event.target;
      if (target instanceof Element && (target.closest(SCAN_TARGET_SELECTOR) || target.closest("[data-scan-switch]"))) {
        return;
      }
      if (!rootIsModal && isInsideModal(target)) {
        return;
      }
      activateCurrent();
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
  }, [activateCurrent, enabled, periodMs, rootRef, revision]);

  return { activateCurrent, index, targetCount };
}

function isInsideModal(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[role="dialog"], [aria-modal="true"]') !== null;
}
