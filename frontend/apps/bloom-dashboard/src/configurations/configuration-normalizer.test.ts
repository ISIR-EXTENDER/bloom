import { type ConfigurationBundle, DEFAULT_APPLICATION_THEME } from "@bloom/api-client";
import { describe, expect, it } from "vitest";
import kinovaManagerConfiguration from "../../../../../backend/seed/applications/kinova-manager.json";
import sandboxV0Configuration from "../../../../../backend/seed/applications/sandbox.json";
import compactSandboxConfiguration from "../../../../../tests/fixtures/compact-sandbox-configuration.json";
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
    expect(normalizedBundle.applications[0]?.runtime_policy.command_frame_id).toBe("");
    expect(normalizedBundle.applications[0]?.runtime_policy.allowed_service_calls).toEqual([]);
  });

  it("keeps Kinova service-call guardrails when a stored app is loaded for editing", () => {
    const normalizedBundle = normalizeConfigurationBundle(kinovaManagerConfiguration as unknown as ConfigurationBundle);

    expect(normalizedBundle.applications[0]?.runtime_policy.allowed_service_calls).toEqual([
      "/fault_controller/reset_fault",
    ]);
  });

  it("keeps the regions a screen reserves for runtime chrome and drops malformed ones", () => {
    const bundle = structuredClone(compactSandboxConfiguration) as unknown as ConfigurationBundle;
    const firstScreen = bundle.applications[0]?.screens[0] as unknown as Record<string, unknown>;
    firstScreen.reserved_regions = [
      { id: "stop", owner: "runtime-chrome", x: 928, y: 410, width: 338, height: 252 },
      { id: "", x: 0, y: 0, width: 10, height: 10 },
      { id: "broken", x: "left" },
      { id: "fractional", x: 10.5, y: 0, width: 10, height: 10 },
      { id: "negative", x: 0, y: -4, width: 10, height: 10 },
      { id: "flat", x: 0, y: 0, width: 10, height: 0 },
      { id: "rail", x: 0, y: 0, width: 1, height: 1 },
    ];

    const screen = normalizeConfigurationBundle(bundle).applications[0]?.screens[0];

    expect(screen?.reserved_regions).toEqual([
      { id: "stop", owner: "runtime-chrome", x: 928, y: 410, width: 338, height: 252 },
      { id: "rail", owner: "runtime-chrome", x: 0, y: 0, width: 1, height: 1 },
    ]);
    expect(
      normalizeConfigurationBundle(compactSandboxConfiguration as unknown as ConfigurationBundle).applications[0]
        ?.screens[0],
    ).not.toHaveProperty("reserved_regions");
  });

  it("refuses configurations written by a newer Bloom schema", () => {
    expect(() =>
      normalizeConfigurationBundle({
        metadata: {
          schema_version: 2,
          exported_at: "2026-09-16T00:00:00Z",
          source: "future-bloom",
        },
        applications: [],
      }),
    ).toThrow("newer than this Bloom build");
  });

  it("keeps the Sandbox V0.0 runtime configuration intact", () => {
    const normalizedBundle = normalizeConfigurationBundle(sandboxV0Configuration as unknown as ConfigurationBundle);
    const application = normalizedBundle.applications[0];

    expect(application?.name).toBe("Sandbox V0.0");
    expect(application?.screens.map((screen) => screen.id)).toEqual([
      "sandbox_control",
      "control_panel",
      "snake_control",
      "visual_servoing",
      "visual_servoing_monitor",
    ]);

    const controlPanel = application?.screens.find((screen) => screen.id === "control_panel");
    expect(controlPanel?.title).toBe("Control Panel");
    // Operator apps target the panel's native mode rather than a generic
    // desktop size, so the artboard names the display it is composed for.
    expect(controlPanel?.canvas).toEqual({ preset_id: "native-1280x720", runtime_mode: "fit" });
    expect(controlPanel?.widgets.some((widget) => widget.kind === "unknown")).toBe(false);
    expect(controlPanel?.widgets.find((widget) => widget.id === "control-panel-mode")).toMatchObject({
      kind: "toggle",
      // The shaping mode as cartesian_manager names it, not the old TeleopCommand enum.
      settings: {
        offPayload: "{data: 'geometric/both'}",
        onPayload: "{data: 'geometric/jaco'}",
        topic: "/mode_request",
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
        topic: "/mode_request",
        messageType: "std_msgs/msg/String",
        payload: { data: "geometric/snake" },
        releasedPayload: { data: "geometric/both" },
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
      // Only what the ISIR stack subscribes to: qontrol's speed input, ros2_control's gripper,
      // the manager's mode request, and the two the visual servoing node reads.
      "/explorer_user_interfaces/rqt_armcontrol/max_linear_speed",
      "/gripper_controller/commands",
      "/mode_request",
      "/ui/visual_servoing/on",
      "/ui/visual_servoing/save",
    ]);
    expect(application?.runtime_policy.allowed_recording_topics).toEqual([
      "/cartesian_command",
      "/ee_pose",
      "/ee_velocity",
      "/joint_states",
      "/joint_target_command",
      "/joystick_cartesian_command",
      "/mode_request",
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
      // Only `primary` was supplied above; the rest come from the shared
      // default, so this asserts against it rather than a copy that drifts.
      preset_id: DEFAULT_APPLICATION_THEME.preset_id,
      palette: {
        accent: DEFAULT_APPLICATION_THEME.palette.accent,
        background: DEFAULT_APPLICATION_THEME.palette.background,
        primary: "#5f7f63",
        surface: DEFAULT_APPLICATION_THEME.palette.surface,
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
