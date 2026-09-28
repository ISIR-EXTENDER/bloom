import "@testing-library/jest-dom/vitest";

import { resetCommandStateForTests } from "@bloom/widget-renderers";
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
  // The command-state store is module-wide; a test must not inherit the last one's snapshot.
  resetCommandStateForTests();
});
