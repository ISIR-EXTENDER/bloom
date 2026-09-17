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

  it("gives a control back the aria-disabled it already had", () => {
    // An unavailable widget says so on its own; resume must not make it look operable.
    const { control } = buildCanvas();
    control.setAttribute("aria-disabled", "true");
    const rootRef = { current: control.parentElement };
    const { rerender } = renderHook(({ stopped }) => useStoppedControls(rootRef, stopped), {
      initialProps: { stopped: true },
    });

    rerender({ stopped: false });

    expect(control.getAttribute("aria-disabled")).toBe("true");
  });

  it("re-disables a control whose re-render put its tab stop back", async () => {
    const { control } = buildCanvas();
    const rootRef = { current: control.parentElement };
    renderHook(() => useStoppedControls(rootRef, true));
    expect(control.tabIndex).toBe(-1);

    // React re-rendering the widget writes tabIndex again, straight onto the node.
    control.setAttribute("tabindex", "0");
    await new Promise((settle) => setTimeout(settle, 0));

    expect(control.tabIndex).toBe(-1);
    expect(control.getAttribute("aria-disabled")).toBe("true");
  });
});
