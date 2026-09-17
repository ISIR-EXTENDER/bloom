import { useEffect } from "react";

const CONTROL_SELECTOR = 'button, [role="application"], [role="slider"], [role="switch"], [tabindex]';
const HELD_TAB_INDEX = "data-stopped-tabindex";

/**
 * While the STOP latch is on, the canvas refuses input. It used to do that in
 * CSS alone: every control kept its tab stop and told a screen reader nothing,
 * so a keyboard or switch operator walked a screen of live-looking controls
 * that answered nothing. STOP and resume are never touched.
 */
export function useStoppedControls(rootRef: { current: HTMLElement | null }, stopped: boolean): void {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !stopped) {
      return;
    }

    const controls = () =>
      [...root.querySelectorAll<HTMLElement>(CONTROL_SELECTOR)].filter(
        (control) => !control.hasAttribute("data-runtime-control-independent"),
      );

    const disable = () => {
      for (const control of controls()) {
        if (control.hasAttribute(HELD_TAB_INDEX)) {
          continue;
        }
        control.setAttribute(HELD_TAB_INDEX, control.getAttribute("tabindex") ?? "");
        control.setAttribute("aria-disabled", "true");
        control.setAttribute("tabindex", "-1");
      }
    };

    disable();
    // A widget that re-renders or arrives with new telemetry must not come back live.
    const observer = new MutationObserver(disable);
    observer.observe(root, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      for (const control of root.querySelectorAll<HTMLElement>(`[${HELD_TAB_INDEX}]`)) {
        const held = control.getAttribute(HELD_TAB_INDEX) ?? "";
        control.removeAttribute(HELD_TAB_INDEX);
        control.removeAttribute("aria-disabled");
        if (held) {
          control.setAttribute("tabindex", held);
        } else {
          control.removeAttribute("tabindex");
        }
      }
    };
  }, [rootRef, stopped]);
}
