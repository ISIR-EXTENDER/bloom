/**
 * @vitest-environment jsdom
 */
import type { ScreenConfig } from "@bloom/api-client";
import { createDefaultWidgetRegistry, renderScreenDescriptors } from "@bloom/widgets";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PositionLibraryWidget } from "./position-library-renderer";
import type { WidgetDataSnapshot } from "./types";

const positionScreen: ScreenConfig = {
  id: "positions",
  title: "Positions",
  canvas: { preset_id: "native-1280x720", runtime_mode: "fit" },
  widgets: [
    {
      id: "positions-library",
      kind: "position-library",
      title: "Saved poses",
      layout: { x: 0, y: 0, width: 460, height: 380 },
      settings: { jointStateTopic: "/joint_states", jointNames: ["joint_1", "joint_2"], show_details: false },
    },
  ],
};

const liveJoints = {
  joints: { names: ["joint_1", "joint_2"], positions: [0.5, -1.2], receivedAt: "2026-09-15T10:00:00Z" },
};

function renderLibrary(data?: Partial<Extract<WidgetDataSnapshot, { type: "position-library" }>>) {
  const descriptor = renderScreenDescriptors(positionScreen, createDefaultWidgetRegistry())[0];
  if (descriptor?.status !== "resolved") throw new Error("Missing descriptor.");
  const onActionIntent = vi.fn();
  render(
    <PositionLibraryWidget
      data={data ? { type: "position-library", saved: [], ...data } : undefined}
      descriptor={descriptor}
      onActionIntent={onActionIntent}
    />,
  );
  return onActionIntent;
}

describe("the position library widget", () => {
  afterEach(cleanup);

  it("cannot capture before a joint state has arrived", () => {
    const onActionIntent = renderLibrary();

    const capture = screen.getByRole("button", { name: "Capture the robot's current pose" });
    expect(capture.hasAttribute("disabled")).toBe(true);
    fireEvent.click(capture);
    expect(onActionIntent).not.toHaveBeenCalled();
  });

  it("captures the live pose, joints and all", () => {
    const onActionIntent = renderLibrary(liveJoints);

    fireEvent.click(screen.getByRole("button", { name: "Capture the robot's current pose" }));

    expect(onActionIntent).toHaveBeenCalledWith({
      type: "position-op",
      op: "capture",
      widgetId: "positions-library",
      widgetKind: "position-library",
      jointNames: ["joint_1", "joint_2"],
      positions: [0.5, -1.2],
    });
  });

  it("lists saved poses and exports only when there is something to export", () => {
    const onActionIntent = renderLibrary({
      ...liveJoints,
      saved: [{ name: "pose-1", jointNames: ["joint_1", "joint_2"], positions: [0, 0] }],
    });

    expect(screen.getByText("pose-1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Export saved poses as manager parameters" }));
    expect(onActionIntent).toHaveBeenCalledWith(expect.objectContaining({ type: "position-op", op: "export" }));
  });

  it("shows the exported parameters and the honest note about dispatch", () => {
    renderLibrary({ saved: [], exportYaml: "joint_targets:\n  joint_names:" });

    expect(screen.getByLabelText("Manager joint-target parameters").textContent).toContain("joint_targets:");
    expect(screen.getByText(/paste the export into the manager/i)).toBeTruthy();
  });
});

describe("deleting a saved pose", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  const savedPose = { saved: [{ name: "pose-1", jointNames: ["joint_1"], positions: [0] }] };

  it("takes two taps, so a stray touch cannot destroy a pose", () => {
    const onActionIntent = renderLibrary(savedPose);
    const remove = screen.getByRole("button", { name: "Delete saved pose pose-1" });

    fireEvent.click(remove);
    expect(onActionIntent).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Confirm deleting pose-1" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Confirm deleting pose-1" }));
    expect(onActionIntent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "position-op", op: "delete", name: "pose-1" }),
    );
  });

  it("disarms on its own instead of staying primed", () => {
    const onActionIntent = renderLibrary(savedPose);

    fireEvent.click(screen.getByRole("button", { name: "Delete saved pose pose-1" }));
    act(() => {
      vi.advanceTimersByTime(4500);
    });

    expect(screen.getByRole("button", { name: "Delete saved pose pose-1" })).toBeTruthy();
    expect(onActionIntent).not.toHaveBeenCalled();
  });
});
