/**
 * @vitest-environment jsdom
 */
import type { ScreenConfig } from "@bloom/api-client";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BuilderCanvas } from "./BuilderCanvas";

afterEach(cleanup);

const tablet: ScreenConfig = {
  id: "drive",
  title: "Drive",
  canvas: { preset_id: "native-1280x720", runtime_mode: "fit" },
  widgets: [],
  reserved_regions: [{ id: "stop", owner: "runtime-chrome", x: 900, y: 400, width: 300, height: 200 }],
} as ScreenConfig;

function renderCanvas(onMoveReservedRegion = vi.fn()) {
  render(
    <BuilderCanvas
      onCommitWidgetLayout={vi.fn()}
      onMoveReservedRegion={onMoveReservedRegion}
      onPreviewWidgetLayout={vi.fn()}
      onSelectWidget={vi.fn()}
      screen={tablet}
      selectedWidgetId={null}
    />,
  );
  return onMoveReservedRegion;
}

describe("dragging STOP on the canvas", () => {
  // Robin, 2026-09-25: the palette says "drag it on the canvas", and the mouse could not take hold of it.
  it("follows the pointer and saves the move once, on release", () => {
    const moved = renderCanvas();
    const stop = screen.getByRole("button", { name: "Move the STOP region" });
    fireEvent.pointerDown(stop, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 60, clientY: 80 });
    fireEvent.pointerMove(window, { clientX: 20, clientY: 50 });
    expect(stop.style.left).toBe("820px");
    expect(stop.style.top).toBe("350px");
    expect(moved).not.toHaveBeenCalled();
    fireEvent.pointerUp(window);
    expect(moved).toHaveBeenCalledTimes(1);
    expect(moved).toHaveBeenCalledWith("stop", { x: 820, y: 350 });
  });

  it("stays inside the artboard, and a cancelled drag saves nothing", () => {
    const moved = renderCanvas();
    const stop = screen.getByRole("button", { name: "Move the STOP region" });
    fireEvent.pointerDown(stop, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(window, { clientX: 5000, clientY: 5000 });
    expect(Number.parseInt(stop.style.left, 10) + 300).toBeLessThanOrEqual(1280);
    fireEvent.pointerCancel(window);
    expect(moved).not.toHaveBeenCalled();
    expect(stop.style.left).toBe("900px");
  });
});
