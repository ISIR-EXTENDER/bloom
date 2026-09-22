import type { ScreenConfig } from "@bloom/api-client";
import { describe, expect, it } from "vitest";
import { resolveCameraStreamProtocols, resolveCameraStreamTargets, resolveCameraStreamUrl } from "./camera-stream";

const screen = (widgets: ScreenConfig["widgets"]): ScreenConfig => ({
  id: "gripper",
  title: "Gripper",
  canvas: { preset_id: "hd", runtime_mode: "fit" },
  widgets,
});

const cameraWidget = (id: string, settings: Record<string, unknown>) => ({
  id,
  kind: "camera" as const,
  title: "Camera",
  layout: { x: 0, y: 0, width: 320, height: 240 },
  settings,
});

describe("which camera widgets open a socket", () => {
  it("takes only the ones pointed at a ROS topic", () => {
    const targets = resolveCameraStreamTargets(
      screen([
        cameraWidget("gripper", { source: "ros-topic", topic: " /camera/color/image_raw/compressed " }),
        // A webcam widget reaches the browser directly and must not cost a backend subscription.
        cameraWidget("local", { source: "webcam", streamUrl: "webcam:///dev/video0" }),
        // A ROS source with no topic yet is an unfinished widget, not a subscription.
        cameraWidget("unfinished", { source: "ros-topic", topic: "  " }),
      ]),
    );

    expect(targets).toEqual([{ widgetId: "gripper", topic: "/camera/color/image_raw/compressed" }]);
  });
});

describe("the camera socket address", () => {
  it("carries the topic and turns https into wss", () => {
    expect(
      resolveCameraStreamUrl("https://robot.lab:8000", "/camera/color/image_raw/compressed", "https://robot.lab"),
    ).toBe("wss://robot.lab:8000/api/v1/runtime/camera?topic=%2Fcamera%2Fcolor%2Fimage_raw%2Fcompressed");
  });

  it("offers a usable key as a subprotocol rather than in the query the access log keeps", () => {
    expect(resolveCameraStreamUrl("http://127.0.0.1:8000", "/camera", "http://127.0.0.1:5173", "abc123")).toBe(
      "ws://127.0.0.1:8000/api/v1/runtime/camera?topic=%2Fcamera",
    );
    expect(resolveCameraStreamProtocols("abc123")).toEqual(["bloom.runtime.v1", "bloom.api-key.abc123"]);
  });

  it("falls back to the query for a key no subprotocol can carry", () => {
    expect(resolveCameraStreamUrl("http://127.0.0.1:8000", "/camera", "http://127.0.0.1:5173", "a b")).toContain(
      "api_key=a+b",
    );
    expect(resolveCameraStreamProtocols("a b")).toBeUndefined();
  });
});
