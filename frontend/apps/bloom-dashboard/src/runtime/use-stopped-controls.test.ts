/**
 * @vitest-environment jsdom
 */

import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useStoppedControls } from "./use-stopped-controls";

function buildCanvas() {
  const canvas = document.createElement("div");
  canvas.innerHTML = '<button type="button">Forward, one step</button>';
  document.body.append(canvas);
  return { canvas, control: canvas.querySelector("button") as HTMLButtonElement };
}

describe("the stopped-controls latch", () => {
  afterEach(() => document.body.replaceChildren());

  it("latches a canvas that remounted while the latch was already on", () => {
    // STOP engages while Settings covers the canvas, then the operator closes
    // Settings: the canvas comes back as new nodes, and they must not be live.
    const first = buildCanvas();
    const rootRef = { current: first.canvas as HTMLElement | null };
    const { rerender } = renderHook(({ stopped }) => useStoppedControls(rootRef, stopped), {
      initialProps: { stopped: false },
    });

    rerender({ stopped: true });
    expect(first.control.getAttribute("aria-disabled")).toBe("true");

    first.canvas.remove();
    const second = buildCanvas();
    rootRef.current = second.canvas;
    rerender({ stopped: true });

    expect(second.control.getAttribute("aria-disabled")).toBe("true");
    expect(second.control.tabIndex).toBe(-1);
  });
});
