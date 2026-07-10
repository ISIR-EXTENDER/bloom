import type { ConfigurationBundle } from "@bloom/api-client";
import { describe, expect, it } from "vitest";

import compactSandboxConfiguration from "../../../../../tests/fixtures/compact-sandbox-configuration.json";
import sandboxV0Configuration from "../../../../../tests/fixtures/sandbox-v0-configuration-bundle.json";
import { normalizeConfigurationBundle } from "./configuration-normalizer";

describe("normalizeConfigurationBundle", () => {
  it("keeps real backend configuration JSON builder-safe", () => {
    const normalizedBundle = normalizeConfigurationBundle(
      compactSandboxConfiguration as unknown as ConfigurationBundle,
    );
    const screen = normalizedBundle.applications[0]?.screens[0];
    const widget = screen?.widgets[0];

    expect(screen?.canvas).toEqual({ preset_id: "hd", runtime_mode: "fit" });
    expect(widget?.layout).toEqual({ x: 128, y: 104, width: 272, height: 192 });
    expect(widget?.settings).toMatchObject({
      payloadOn: { data: [13, 1] },
      payloadOff: { data: [13, 0] },
      topic: "/ui/ros_toggle",
    });
  });

  it("keeps the Sandbox V0.0 six-screen runtime configuration intact", () => {
    const normalizedBundle = normalizeConfigurationBundle(sandboxV0Configuration as unknown as ConfigurationBundle);
    const application = normalizedBundle.applications[0];

    expect(application?.name).toBe("Sandbox V0.0");
    expect(application?.screens.map((screen) => screen.id)).toEqual([
      "sandbox_control",
      "sandbox_teleop_config",
      "control_panel",
      "snake_control",
      "visual_servoing",
      "visual_servoing_monitor",
    ]);

    const controlPanel = application?.screens.find((screen) => screen.id === "control_panel");
    expect(controlPanel?.title).toBe("Control Panel");
    expect(controlPanel?.canvas).toEqual({ preset_id: "hd", runtime_mode: "fit" });
    expect(controlPanel?.widgets.some((widget) => widget.kind === "unknown")).toBe(false);
    expect(controlPanel?.widgets.find((widget) => widget.id === "control-panel-mode")).toMatchObject({
      kind: "toggle",
      settings: {
        offPayload: { data: 0 },
        onPayload: { data: 3 },
        topic: "/cmd/mode",
      },
    });
    expect(
      Object.fromEntries(
        ["control-panel-max-velocity", "control-panel-z", "control-panel-rz"].map((widgetId) => {
          const widget = controlPanel?.widgets.find((candidate) => candidate.id === widgetId);
          return [widgetId, { intent: widget?.settings.intent_label, unit: widget?.settings.unit }];
        }),
      ),
    ).toEqual({
      "control-panel-max-velocity": { intent: "Teleoperation gain", unit: "x" },
      "control-panel-rz": { intent: "Yaw velocity", unit: "rad/s" },
      "control-panel-z": { intent: "Vertical velocity", unit: "m/s" },
    });

    const snakeHold = application?.screens
      .find((screen) => screen.id === "snake_control")
      ?.widgets.find((widget) => widget.id === "snake-hold");
    expect(snakeHold).toMatchObject({
      kind: "command-button",
      settings: {
        momentary: true,
        topic: "/snake_control/enable",
        messageType: "std_msgs/msg/Bool",
        payload: "{data: true}",
        releasedPayload: "{data: false}",
      },
    });

    const monitorScreen = application?.screens.find((screen) => screen.id === "visual_servoing_monitor");
    expect(monitorScreen?.title).toBe("Visual Servoing Monitor");

    const monitorEchoTopics = monitorScreen?.widgets
      .filter((widget) => widget.kind === "topic-echo")
      .map((widget) => widget.settings.topic)
      .sort();
    expect(monitorEchoTopics).toEqual(["/tag_detections"]);

    const monitorPlotFields = monitorScreen?.widgets
      .filter((widget) => widget.kind === "topic-plot")
      .map((widget) => `${widget.settings.topic}:${widget.settings.fieldPath}`)
      .sort();
    expect(monitorPlotFields).toEqual([
      "/visual_servoing/error_TAGtoTAGd:twist.linear.x",
      "/visual_servoing/error_TAGtoTAGd:twist.linear.y",
      "/visual_servoing/error_TAGtoTAGd:twist.linear.z",
      "/visual_servoing/velocity_command:twist.linear.x",
      "/visual_servoing/velocity_command:twist.linear.y",
      "/visual_servoing/velocity_command:twist.linear.z",
    ]);
    expect(application?.runtime_policy.allowed_publish_topics).toEqual([
      "/cmd/gripper",
      "/cmd/joystick_rz",
      "/cmd/joystick_z",
      "/cmd/max_velocity",
      "/cmd/mode",
      "/sandbox/digital_output",
      "/snake_control/enable",
      "/teleop_config/angular_scale_x",
      "/teleop_config/angular_scale_y",
      "/teleop_config/angular_scale_z",
      "/teleop_config/invert_angular_x",
      "/teleop_config/invert_angular_y",
      "/teleop_config/invert_angular_z",
      "/teleop_config/invert_linear_x",
      "/teleop_config/invert_linear_y",
      "/teleop_config/invert_linear_z",
      "/teleop_config/linear_scale_x",
      "/teleop_config/linear_scale_y",
      "/teleop_config/linear_scale_z",
      "/teleop_config/reset_defaults",
      "/teleop_config/rotation_gain",
      "/teleop_config/save_profile",
      "/teleop_config/swap_xy",
      "/teleop_config/translation_gain",
      "/ui/visual_servoing/on",
      "/ui/visual_servoing/save",
    ]);
    expect(application?.runtime_policy.allowed_recording_topics).toEqual([
      "/joint_states",
      "/sandbox_controller/ee_pose",
      "/sandbox_controller/joint_pose",
      "/sandbox_controller/velocity_command",
      "/tag_detections",
      "/teleop_cmd",
      "/visual_servoing/error_TAGtoTAGd",
      "/visual_servoing/velocity_command",
    ]);
  });

  it("keeps unsupported widget kinds renderable as unknown widgets", () => {
    const bundle = normalizeConfigurationBundle({
      metadata: {
        schema_version: 1,
        exported_at: "2026-06-01T14:00:00Z",
        source: "test",
      },
      applications: [
        {
          id: "sandbox",
          name: "Sandbox",
          description: "",
          screens: [
            {
              id: "main",
              title: "Main",
              widgets: [
                {
                  id: "legacy-widget",
                  kind: "legacy-custom-widget",
                  title: "Legacy widget",
                  settings: { appSpecific: true },
                },
              ],
            },
          ],
        },
      ],
    } as unknown as ConfigurationBundle);

    expect(bundle.applications[0]?.screens[0]?.widgets[0]).toMatchObject({
      id: "legacy-widget",
      kind: "unknown",
      layout: { x: 0, y: 0, width: 240, height: 120 },
      settings: { appSpecific: true },
    });
    expect(bundle.applications[0]?.profiles).toEqual([]);
  });

  it("normalizes app theme inspiration with safe defaults", () => {
    const bundle = normalizeConfigurationBundle({
      metadata: {
        schema_version: 1,
        exported_at: "2026-06-01T14:00:00Z",
        source: "test",
      },
      applications: [
        {
          id: "demo",
          name: "Demo",
          description: "",
          theme: {
            inspiration: {
              moodboard_image_uri: "/theme-assets/demo.png",
              reference_url: "https://example.com/reference",
            },
            palette: {
              primary: "#5f7f63",
            },
          },
          screens: [],
        },
      ],
    } as unknown as ConfigurationBundle);

    expect(bundle.applications[0]?.theme).toEqual({
      inspiration: {
        moodboard_image_uri: "/theme-assets/demo.png",
        reference_url: "https://example.com/reference",
      },
      preset_id: "extender-ui",
      palette: {
        accent: "#0ea5e9",
        background: "#f8fafc",
        primary: "#5f7f63",
        surface: "#ffffff",
      },
    });
    expect(bundle.applications[0]?.profiles).toEqual([]);
  });

  it("normalizes reusable action presets with unique ids", () => {
    const bundle = normalizeConfigurationBundle({
      metadata: {
        schema_version: 1,
        exported_at: "2026-06-01T14:00:00Z",
        source: "test",
      },
      applications: [
        {
          id: "demo",
          name: "Demo",
          description: "",
          action_presets: [
            {
              id: "stop",
              name: "Stop",
              kind: "topic-publish",
              topic: "/stop",
              message_type: "std_msgs/msg/Bool",
              payload_text: "{data: true}",
              tags: ["safety"],
            },
            {
              id: "stop",
              name: "Stop duplicate",
            },
          ],
          screens: [],
        },
      ],
    } as unknown as ConfigurationBundle);

    expect(bundle.applications[0]?.action_presets).toEqual([
      expect.objectContaining({
        id: "stop",
        name: "Stop",
        payload: null,
        payload_text: "{data: true}",
        tags: ["safety"],
      }),
      expect.objectContaining({
        id: "stop-2",
        name: "Stop duplicate",
        kind: "topic-publish",
        tags: [],
      }),
    ]);
  });
});
