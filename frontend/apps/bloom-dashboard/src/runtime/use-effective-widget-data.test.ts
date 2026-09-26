/**
 * @vitest-environment jsdom
 */
import type { ScreenConfig } from "@bloom/api-client";
import type { WidgetDataSnapshot } from "@bloom/widget-renderers";
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { RuntimeTeleopCommandRequest } from "./runtime-protocol";
import { useEffectiveWidgetData } from "./use-effective-widget-data";

const screen: ScreenConfig = {
  id: "mixed",
  title: "Mixed",
  canvas: { preset_id: "native-1280x720", runtime_mode: "fit" },
  widgets: [
    {
      id: "plot",
      kind: "plot-board",
      title: "Plot",
      layout: { x: 0, y: 0, width: 400, height: 300 },
      settings: { series: [{ topic: "/ee_velocity", field_path: "twist.linear.x", label: "Speed" }] },
    },
    {
      id: "view",
      kind: "robot-3d",
      title: "Robot",
      layout: { x: 400, y: 0, width: 400, height: 300 },
      settings: { jointStateTopic: "/joint_states" },
    },
    {
      id: "camera",
      kind: "camera",
      title: "Camera",
      layout: { x: 800, y: 0, width: 400, height: 300 },
      settings: { source: "ros-topic", topic: "/camera/image/compressed" },
    },
  ],
};

const twist = (x: number): RuntimeTeleopCommandRequest => ({
  angular: { x: 0, y: 0, z: 0 },
  linear: { x, y: 0, z: 0 },
  mode: 0,
  seq: 1,
  target: "/joystick_cartesian_command",
  type: "teleop_cmd",
});

const frame = (frameUrl: string): Record<string, WidgetDataSnapshot> => ({
  camera: { type: "camera-frame", topic: "/camera/image/compressed", connected: true, frameUrl, receivedAt: 1 },
});

describe("the merged widget data", () => {
  it("keeps every snapshot whose inputs did not change", () => {
    const base = {
      cameraFrames: frame("blob:1"),
      dataByWidgetId: {},
      plotSelections: {},
      positionLibrary: null,
      screen,
    };
    const { result, rerender } = renderHook((props) => useEffectiveWidgetData(props), {
      initialProps: { ...base, commandTwist: twist(0.1) },
    });
    const first = result.current;

    // A camera frame: plot board and 3D view keep their references.
    rerender({ ...base, cameraFrames: frame("blob:2"), commandTwist: twist(0.1) });
    const afterFrame = result.current;
    expect(afterFrame.plot).toBe(first.plot);
    expect(afterFrame.view).toBe(first.view);
    expect(afterFrame.camera).not.toBe(first.camera);

    // A new twist: only the 3D view changes.
    rerender({
      ...base,
      cameraFrames: afterFrame.camera ? { camera: afterFrame.camera } : {},
      commandTwist: twist(0.2),
    });
    expect(result.current.plot).toBe(first.plot);
    expect(result.current.camera).toBe(afterFrame.camera);
    expect(result.current.view).not.toBe(afterFrame.view);

    // Equal inputs in new objects: the whole record holds.
    const held = result.current;
    rerender({ ...base, cameraFrames: { camera: afterFrame.camera as WidgetDataSnapshot }, commandTwist: twist(0.2) });
    expect(result.current).toBe(held);
  });
});
