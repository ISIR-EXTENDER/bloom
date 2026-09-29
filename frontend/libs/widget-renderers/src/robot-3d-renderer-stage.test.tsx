/**
 * @vitest-environment jsdom
 */
import type { CommandStateEntry } from "@bloom/api-client";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyCommandStateMessage, resetCommandStateForTests } from "./command-state";
import { Robot3dWidget } from "./robot-3d-renderer";
import type { RobotModelSource, WidgetRendererProps } from "./types";

// A browser with WebGL, drawn by a renderer that keeps nothing: the widget's chrome is what is under test here.
vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();
  class WebGLRenderer {
    domElement = document.createElement("canvas");
    setPixelRatio() {}
    setSize() {}
    render() {}
    dispose() {}
  }
  return { ...actual, WebGLRenderer };
});

const URDF = `<robot name="arm">
  <link name="base_link"/>
  <link name="upper"/>
  <link name="tool"/>
  <joint name="shoulder" type="revolute"><parent link="base_link"/><child link="upper"/><axis xyz="0 0 1"/><limit lower="-3" upper="3" effort="1" velocity="1"/></joint>
  <joint name="elbow" type="revolute"><parent link="upper"/><child link="tool"/><axis xyz="0 0 1"/><limit lower="-3" upper="3" effort="1" velocity="1"/></joint>
</robot>`;

const robotModel: RobotModelSource = { asset: async () => null, load: async () => URDF };

function descriptor(settings: Record<string, unknown> = {}) {
  return {
    context: { deviceClass: "desktop" },
    widget: {
      id: "view",
      kind: "robot-3d",
      title: "Robot",
      layout: { x: 0, y: 0, width: 600, height: 400 },
      settings: { jointStateTopic: "/joint_states", goalsTopic: "/shared_control/goals", ...settings },
    },
  } as unknown as WidgetRendererProps["descriptor"];
}

type Snapshot = Extract<WidgetRendererProps["data"], { type: "robot-3d" }>;
const snapshot = (extra: Partial<Snapshot> = {}): Snapshot => ({
  receivedAt: new Date().toISOString(),
  topic: "/joint_states",
  type: "robot-3d",
  value: { name: ["shoulder"], position: [0.4] },
  ...extra,
});

const stage = () => screen.getByRole("img", { name: "Robot 3D view" });

beforeEach(() => {
  vi.stubGlobal("WebGLRenderingContext", class {});
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  resetCommandStateForTests();
  vi.unstubAllGlobals();
});

describe("the 3D robot view on a stage that can draw", () => {
  it("offers to frame the robot once it is drawn, and reports what the stage shows", async () => {
    render(<Robot3dWidget data={snapshot()} descriptor={descriptor()} robotModel={robotModel} />);
    await waitFor(() => expect(stage().getAttribute("data-model")).toBe("ready"));
    await waitFor(() => expect(stage().getAttribute("data-joints")).toBe("1/2"));
    expect(stage().getAttribute("data-links")).toBe("3");
    expect(screen.getByText("1 live joint, 1 of the model's 2 driven")).toBeTruthy();
    const frame = screen.getByRole("button", { name: "Frame the robot" });
    fireEvent.click(frame);
    expect(stage().getAttribute("data-model")).toBe("ready");
  });

  it("shows the drag-and-wheel hint until the first gesture, then remembers it was seen", async () => {
    const { unmount } = render(<Robot3dWidget data={snapshot()} descriptor={descriptor()} robotModel={robotModel} />);
    await waitFor(() => expect(screen.getByText("Drag to turn · wheel to zoom")).toBeTruthy());
    fireEvent.pointerDown(stage());
    expect(screen.queryByText("Drag to turn · wheel to zoom")).toBeNull();
    expect(window.localStorage.getItem("bloom.robot3d.gestureHintSeen")).toBe("1");
    unmount();

    render(<Robot3dWidget data={snapshot()} descriptor={descriptor()} robotModel={robotModel} />);
    await waitFor(() => expect(stage().getAttribute("data-model")).toBe("ready"));
    expect(screen.queryByText("Drag to turn · wheel to zoom")).toBeNull();
  });

  it("dismisses the hint on a wheel as well, and shows no hint when storage is unavailable but still draws", async () => {
    const storage = window.localStorage;
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("blocked");
      },
    });
    try {
      render(<Robot3dWidget data={snapshot()} descriptor={descriptor()} robotModel={robotModel} />);
      await waitFor(() => expect(screen.getByText("Drag to turn · wheel to zoom")).toBeTruthy());
      fireEvent.wheel(stage());
      expect(screen.queryByText("Drag to turn · wheel to zoom")).toBeNull();
    } finally {
      Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
    }
  });

  it("draws the shared-control goals while the manager reports Assist on, and drops them once it reports it off", async () => {
    const goals = {
      header: { frame_id: "base_link" },
      poses: [{ position: { x: 0.3, y: 0, z: 0.2 }, orientation: { w: 1 } }],
    };
    const data = snapshot({ goals, goalsReceivedAt: new Date().toISOString() });
    render(<Robot3dWidget data={data} descriptor={descriptor()} robotModel={robotModel} />);
    await waitFor(() => expect(stage().getAttribute("data-goals")).toBe("1"));

    const off: CommandStateEntry = { value: false, source: "measured", by: "robot", revision: 1, updated_at: "" };
    act(() => {
      applyCommandStateMessage({ type: "command_state", revision: 1, snapshot: { "shared_control:active": off } });
    });
    await waitFor(() => expect(stage().getAttribute("data-goals")).toBe("0"));
  });

  it("drops the soft goal once its stream has been quiet for three seconds", async () => {
    vi.useFakeTimers();
    try {
      const softGoal = {
        header: { frame_id: "base_link" },
        pose: { position: { x: 0.3, y: 0, z: 0.2 }, orientation: { w: 1 } },
      };
      const data = snapshot({ softGoal, softGoalReceivedAt: new Date().toISOString() });
      render(
        <Robot3dWidget
          data={data}
          descriptor={descriptor({ softGoalTopic: "/shared_control/soft_goal" })}
          robotModel={robotModel}
        />,
      );
      await act(() => vi.advanceTimersByTimeAsync(100));
      expect(stage().getAttribute("data-soft-goal")).toBe("shown");
      await act(() => vi.advanceTimersByTimeAsync(3500));
      expect(stage().getAttribute("data-soft-goal")).toBe("none");
    } finally {
      vi.useRealTimers();
    }
  });

  it("says when the API has no robot description, without the Frame button", async () => {
    render(
      <Robot3dWidget
        data={snapshot()}
        descriptor={descriptor()}
        robotModel={{ asset: async () => null, load: async () => null }}
      />,
    );
    await waitFor(() => expect(stage().getAttribute("data-model")).toBe("unavailable"));
    expect(screen.getByText(/No robot description from the API yet/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Frame the robot" })).toBeNull();
  });

  it("hides its title when asked and still names the joint state topic in the summary", async () => {
    render(
      <Robot3dWidget descriptor={descriptor({ hide_title: true, markerTopic: "/markers" })} robotModel={robotModel} />,
    );
    expect(document.querySelector(".bloom-display-header")).toBeNull();
    expect(screen.getByText(/Waiting for joint states · markers \/markers/)).toBeTruthy();
    await waitFor(() => expect(stage().getAttribute("data-model")).toBe("ready"));
  });
});
