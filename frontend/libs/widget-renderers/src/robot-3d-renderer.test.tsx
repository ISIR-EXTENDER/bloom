/**
 * @vitest-environment jsdom
 */
import type { ScreenConfig } from "@bloom/api-client";
import { createDefaultWidgetRegistry, renderScreenDescriptors } from "@bloom/widgets";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWidgetDescriptor } from "./index";
import { summarizeJointState } from "./robot-3d-renderer";

const robotScreen: ScreenConfig = {
  id: "robot",
  title: "Robot",
  canvas: { preset_id: "full-hd", runtime_mode: "fit" },
  widgets: [
    {
      id: "view",
      kind: "robot-3d",
      title: "Robot",
      layout: { x: 0, y: 0, width: 546, height: 420 },
      settings: {
        jointStateTopic: "/joint_states",
        markerTopic: "/goal_markers",
        showAxes: true,
        modelSource: "extension",
        robotModelUrl: "",
      },
    },
  ],
};

afterEach(cleanup);

function renderView(options: Parameters<typeof renderWidgetDescriptor>[1]) {
  const descriptor = renderScreenDescriptors(robotScreen, createDefaultWidgetRegistry())[0];
  if (descriptor?.status !== "resolved") {
    throw new Error("the fixture did not resolve");
  }
  return render(renderWidgetDescriptor(descriptor, options));
}

describe("the 3D robot view", () => {
  it("says whether the runtime is driving, from the twist it carries", () => {
    const descriptor = renderScreenDescriptors(robotScreen, createDefaultWidgetRegistry())[0];
    if (descriptor?.status !== "resolved") {
      throw new Error("the fixture did not resolve");
    }
    const { rerender } = render(
      renderWidgetDescriptor(descriptor, {
        dataByWidgetId: {
          view: {
            receivedAt: "t",
            topic: "/joint_states",
            type: "robot-3d",
            value: undefined,
            command: { angular: { x: 0, y: 0, z: 0 }, linear: { x: 0, y: 0.8, z: 0 } },
          },
        },
      }),
    );
    expect(screen.getByRole("img", { name: "Robot 3D view" }).getAttribute("data-command")).toBe("moving");
    rerender(renderWidgetDescriptor(descriptor, {}));
    expect(screen.getByRole("img", { name: "Robot 3D view" }).getAttribute("data-command")).toBe("still");
  });

  it("counts a pure rotation as driving, and starts with nothing unplaced or loading", () => {
    const descriptor = renderScreenDescriptors(robotScreen, createDefaultWidgetRegistry())[0];
    if (descriptor?.status !== "resolved") {
      throw new Error("the fixture did not resolve");
    }
    render(
      renderWidgetDescriptor(descriptor, {
        dataByWidgetId: {
          view: {
            receivedAt: "t",
            topic: "/joint_states",
            type: "robot-3d",
            value: undefined,
            command: { angular: { x: 0, y: 0, z: 0.6 }, linear: { x: 0, y: 0, z: 0 }, frameId: "effector_frame" },
          },
        },
      }),
    );
    const stage = screen.getByRole("img", { name: "Robot 3D view" });
    expect(stage.getAttribute("data-command")).toBe("moving");
    expect(stage.getAttribute("data-markers-unplaced")).toBe("0");
    expect(stage.getAttribute("data-markers-loading")).toBe("0");
    expect(stage.getAttribute("data-target")).toBe("none");
    expect(stage.getAttribute("data-pose")).toBe("none");
    expect(stage.getAttribute("data-joints")).toBe("0/0");
    // Framing needs a drawn robot.
    expect(screen.queryByRole("button", { name: "Frame the robot" })).toBeNull();
  });

  it("marks the view stale when joint states stop arriving, and says for how long", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-24T22:00:10Z"));
    try {
      const descriptor = renderScreenDescriptors(robotScreen, createDefaultWidgetRegistry())[0];
      if (descriptor?.status !== "resolved") {
        throw new Error("the fixture did not resolve");
      }
      render(
        renderWidgetDescriptor(descriptor, {
          dataByWidgetId: {
            view: { receivedAt: "2026-09-24T22:00:09Z", topic: "/joint_states", type: "robot-3d", value: undefined },
          },
        }),
      );
      const stage = screen.getByRole("img", { name: "Robot 3D view" });
      expect(stage.getAttribute("data-stale")).toBe("false");
      act(() => {
        vi.advanceTimersByTime(4000);
      });
      // The seconds ride on the attribute; the note itself needs a drawable stage, which jsdom has not.
      expect(stage.getAttribute("data-stale")).toBe("5");
    } finally {
      vi.useRealTimers();
    }
  });

  it("says how many of the model's joints the state drives, when not all of them", () => {
    expect(summarizeJointState({ name: ["a", "b"], position: [0, 0] }, { driven: 2, total: 2 })).toBe("2 live joints");
    expect(summarizeJointState({ name: ["a", "b"], position: [0, 0] }, { driven: 2, total: 7 })).toBe(
      "2 live joints, 2 of the model's 7 driven",
    );
  });

  it("draws nothing on a tablet-class screen, whatever the runtime offers", () => {
    const tabletScreen: ScreenConfig = {
      ...robotScreen,
      canvas: { preset_id: "native-1280x720", runtime_mode: "fit" },
    };
    const descriptor = renderScreenDescriptors(tabletScreen, createDefaultWidgetRegistry())[0];
    if (descriptor?.status !== "resolved") {
      throw new Error("the fixture did not resolve");
    }
    render(renderWidgetDescriptor(descriptor, { robotModel: { asset: async () => null, load: async () => null } }));
    expect(screen.getByText("Desktop screens only.")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Robot 3D view" }).getAttribute("data-model")).toBe("unavailable");
  });

  it("says so when the runtime hands it no robot model source", () => {
    renderView({});
    expect(screen.getByText("No robot model source in this runtime.")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Robot 3D view" }).getAttribute("data-model")).toBe("unavailable");
  });

  it("says so when the browser cannot draw 3D, and still names its topics", () => {
    // jsdom has no WebGL, which is exactly the browser the note is for.
    renderView({ robotModel: { asset: async () => null, load: async () => null } });
    expect(screen.getByText("This browser cannot draw 3D.")).toBeTruthy();
    expect(screen.getByText(/markers \/goal_markers/)).toBeTruthy();
  });
});
