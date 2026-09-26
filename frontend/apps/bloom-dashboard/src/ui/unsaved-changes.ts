import { useEffect } from "react";

/** What each open editor would lose, keyed by editor; empty when nothing is unsaved. */
const unsaved = new Map<symbol, string>();
let confirmedLeave = false;

/**
 * Registers an editor's unsaved work, so leaving by the product navigation or closing the tab asks first.
 * Only the in-page Back buttons asked before: a top tab or a reload dropped a draft without a word.
 */
export function useUnsavedChanges(isDirty: boolean, message: string): void {
  useEffect(() => {
    if (!isDirty) {
      return;
    }
    const key = Symbol(message);
    unsaved.set(key, message);
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      unsaved.delete(key);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [isDirty, message]);
}

/** Asks about unsaved work; true when there is none or the author agreed to lose it. */
export function confirmLeavingUnsaved(): boolean {
  if (confirmedLeave) {
    confirmedLeave = false;
    return true;
  }
  const messages = [...unsaved.values()];
  return messages.length === 0 || window.confirm(messages.join("\n"));
}

/** An in-page Back that already asked: the navigation it triggers does not ask again. */
export function leaveAfterConfirming(isDirty: boolean, message: string, leave: () => void): void {
  if (isDirty && !window.confirm(message)) {
    return;
  }
  confirmedLeave = isDirty;
  leave();
  confirmedLeave = false;
}
