import "@testing-library/jest-dom/vitest";

import { resetDesiredStates } from "@bloom/widget-renderers";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

class TestResizeObserver implements ResizeObserver {
  disconnect() {
    return undefined;
  }

  observe() {
    return undefined;
  }

  unobserve() {
    return undefined;
  }
}

globalThis.ResizeObserver = globalThis.ResizeObserver ?? TestResizeObserver;
globalThis.PointerEvent = globalThis.PointerEvent ?? MouseEvent;
Object.defineProperty(globalThis, "scrollTo", {
  configurable: true,
  value: () => undefined,
});

afterEach(() => {
  cleanup();
  // A control's desired state outlives its unmount (ADR 0141); a test must not inherit the last one's.
  resetDesiredStates();
});
