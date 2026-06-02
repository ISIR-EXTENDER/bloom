import "@testing-library/jest-dom/vitest";

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

afterEach(() => {
  cleanup();
});
