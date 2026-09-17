import { useEffect, useLayoutEffect, useState } from "react";

const CONTROL_SELECTOR = 'button, [role="application"], [role="slider"], [role="switch"], [tabindex]';
const HELD_TAB_INDEX = "data-stopped-tabindex";
const HELD_ARIA_DISABLED = "data-stopped-aria-disabled";

/**
 * While the STOP latch is on, the canvas refuses input. It used to do that in
 * CSS alone: every control kept its tab stop and told a screen reader nothing,
 * so a keyboard or switch operator walked a screen of live-looking controls
 * that answered nothing. STOP and resume are never touched.
 */
export function useStoppedControls(rootRef: { current: HTMLElement | null }, stopped: boolean): void {
  const [root, setRoot] = useState<HTMLElement | null>(null);

  // Settings and the tour unmount the canvas; the remounted node must be latched, not the detached one.
  useLayoutEffect(() => {
    setRoot((current) => (current === rootRef.current ? current : rootRef.current));
  });

  useEffect(() => {
    if (!root || !stopped) {
      return;
    }

    const controls = () =>
      [...root.querySelectorAll<HTMLElement>(CONTROL_SELECTOR)].filter(
        (control) => !control.hasAttribute("data-runtime-control-independent"),
      );

    const disable = () => {
      for (const control of controls()) {
        if (!control.hasAttribute(HELD_TAB_INDEX)) {
          control.setAttribute(HELD_TAB_INDEX, control.getAttribute("tabindex") ?? "");
          control.setAttribute(HELD_ARIA_DISABLED, control.getAttribute("aria-disabled") ?? "");
        }
        // Written only when it differs, or the observer would answer its own writes forever.
        if (control.getAttribute("aria-disabled") !== "true") {
          control.setAttribute("aria-disabled", "true");
        }
        if (control.getAttribute("tabindex") !== "-1") {
          control.setAttribute("tabindex", "-1");
        }
      }
    };

    disable();
    // A widget that re-renders, re-sets its tabindex, or arrives with new telemetry must not come back live.
    const observer = new MutationObserver(disable);
    observer.observe(root, {
      attributeFilter: ["aria-disabled", "tabindex"],
      attributes: true,
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
      for (const control of root.querySelectorAll<HTMLElement>(`[${HELD_TAB_INDEX}]`)) {
        const heldTabIndex = control.getAttribute(HELD_TAB_INDEX) ?? "";
        const heldAriaDisabled = control.getAttribute(HELD_ARIA_DISABLED) ?? "";
        control.removeAttribute(HELD_TAB_INDEX);
        control.removeAttribute(HELD_ARIA_DISABLED);
        restore(control, "aria-disabled", heldAriaDisabled);
        restore(control, "tabindex", heldTabIndex);
      }
    };
  }, [root, stopped]);
}

function restore(control: HTMLElement, name: string, held: string): void {
  if (held) {
    control.setAttribute(name, held);
  } else {
    control.removeAttribute(name);
  }
}
