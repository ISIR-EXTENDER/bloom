import { type MutableRefObject, useCallback, useRef } from "react";

/**
 * A scan or dwell activation, which a control may accept in place of a hold.
 *
 * Reaching a control by switch or by resting on it is already slow and
 * deliberate -- the very thing a 1.5 s hold exists to require -- but it arrives
 * as a plain click, which a hold ignores. Such a control listens for this event
 * and calls `preventDefault()`; everything else is clicked as before.
 */
const ASSISTIVE_ACTIVATE_EVENT = "bloom-assistive-activate";

export function activateAssistively(target: HTMLElement): void {
  const handled = !target.dispatchEvent(new CustomEvent(ASSISTIVE_ACTIVATE_EVENT, { cancelable: true }));
  if (!handled) {
    target.click();
  }
}

/**
 * Accepts an assistive activation without touching the pointer hold. Returns a
 * ref callback for the control, and also fills `nodeRef` when one is given.
 */
export function useAssistiveActivation<Element extends HTMLElement>(
  onActivate: () => void,
  nodeRef?: MutableRefObject<Element | null>,
): (node: Element | null) => void {
  const onActivateRef = useRef(onActivate);
  const detachRef = useRef<(() => void) | null>(null);
  onActivateRef.current = onActivate;

  return useCallback(
    (node: Element | null) => {
      detachRef.current?.();
      detachRef.current = null;
      if (nodeRef) {
        nodeRef.current = node;
      }
      if (!node) {
        return;
      }
      const listener = (event: Event) => {
        event.preventDefault();
        onActivateRef.current();
      };
      node.addEventListener(ASSISTIVE_ACTIVATE_EVENT, listener);
      detachRef.current = () => node.removeEventListener(ASSISTIVE_ACTIVATE_EVENT, listener);
    },
    [nodeRef],
  );
}
