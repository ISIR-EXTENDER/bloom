import type { ApplicationConfig } from "@bloom/api-client";
import {
  type ConfigurationBundle,
  createBloomApiClient,
  type ScreenConfig,
  WIDGET_KINDS,
  type WidgetConfig,
} from "@bloom/api-client";
import { describe, expect, it } from "vitest";
import explorerCameraTestSeed from "../../../../backend/seed/applications/explorer-camera-test.json";
import explorerManagerSeed from "../../../../backend/seed/applications/explorer-manager.json";
import kinovaCameraTestSeed from "../../../../backend/seed/applications/kinova-camera-test.json";
import kinovaManagerSeed from "../../../../backend/seed/applications/kinova-manager.json";
import legacyPetanqueApplication from "../../../../backend/tests/fixtures/legacy/application-play-petanque.json";
import legacyConfigurationsScreen from "../../../../backend/tests/fixtures/legacy/configurations.json";
import legacySandboxScreen from "../../../../backend/tests/fixtures/legacy/sandbox_control.json";
import sharedConfigurationBundle from "../../../../tests/fixtures/configuration-bundle.json";
import widgetKindsContract from "../../../../tests/fixtures/widget-kinds-contract.json";

import {
  addWidgetToScreen,
  appendTopicEchoMessage,
  appendTopicPlotSample,
  createDefaultWidgetRegistry,
  createWidgetActionIntent,
  createWidgetConfigFromDefinition,
  createWidgetRegistry,
  DEFAULT_WIDGET_DEFINITIONS,
  deriveSliderStep,
  duplicateWidgetInScreen,
  formatTopicEchoValue,
  getDefaultRosMessageTogglePayloads,
  getRosMessageCommandPresetsByCategory,
  getWidgetSettingsContract,
  gripperToggleSettings,
  LEGACY_WIDGET_KIND_MAPPINGS,
  legacyCanvasScreensToApplicationConfig,
  legacyCanvasScreenToConfig,
  legacyCanvasWidgetToConfig,
  legacyRectToLayout,
  normalizeWidgetSettings,
  ROS_MESSAGE_COMMAND_PRESETS,
  ROS_MESSAGE_TOGGLE_PRESETS,
  removeWidgetFromScreen,
  renderScreenDescriptors,
  renderWidgetDescriptor,
  resolveCanvasArtboardSize,
  resolveCanvasFitScale,
  resolveCanvasPresetSize,
  resolveFieldPath,
  resolveLegacyWidgetKind,
  snapLayoutValue,
  type TopicMessage,
  type TopicPlotSample,
  updateWidgetSettings,
  updateWidgetTitle,
  validateWidgetSettings,
  WIDGET_SETTINGS_CONTRACTS,
  type WidgetDefinition,
} from "./index";

const sampleBundle = sharedConfigurationBundle as unknown as ConfigurationBundle;

/** The legacy import is an application-level converter now; these tests still check a whole bundle. */
function legacyBundleFrom(
  screens: Parameters<typeof legacyCanvasScreensToApplicationConfig>[0],
  options: { application?: unknown; exportedAt?: string; source?: string } = {},
) {
  return {
    metadata: {
      schema_version: 1,
      exported_at: options.exportedAt ?? new Date(0).toISOString(),
      source: options.source ?? "extender_ui_legacy",
    },
    applications: [
      legacyCanvasScreensToApplicationConfig(
        screens,
        options.application as Parameters<typeof legacyCanvasScreensToApplicationConfig>[1],
      ),
    ],
  };
}
const sampleScreen = sampleBundle.applications[0]?.screens[0] as ScreenConfig;
const sampleWidget = sampleScreen.widgets[0];
const contractWidgetKinds = widgetKindsContract.widget_kinds;

describe("widget registry foundation", () => {
  it("creates a registry from widget definitions", () => {
    const definition = createTestWidgetDefinition("command-button", "Command button");
    const registry = createWidgetRegistry([definition]);

    expect(registry.get("command-button")).toEqual(definition);
  });

  it("rejects duplicate widget definitions", () => {
    expect(() =>
      createWidgetRegistry([
        createTestWidgetDefinition("toggle", "Toggle A"),
        createTestWidgetDefinition("toggle", "Toggle B"),
      ]),
    ).toThrow('Duplicate widget definition for kind "toggle".');
  });

  it("resolves registered widgets from the shared configuration fixture", () => {
    const registry = createDefaultWidgetRegistry();

    const descriptor = renderWidgetDescriptor(sampleWidget, registry, { screenId: sampleScreen.id });

    expect(descriptor).toMatchObject({
      status: "resolved",
      widget: {
        id: "toggle",
        kind: "command-button",
      },
      definition: {
        category: "command",
        displayName: "Command button",
      },
      context: {
        screenId: "main",
      },
    });
  });

  it("returns a safe descriptor for unknown widgets", () => {
    const registry = createWidgetRegistry();

    const descriptor = renderWidgetDescriptor(sampleWidget, registry, { screenId: sampleScreen.id });

    expect(descriptor).toEqual({
      status: "unknown",
      widget: sampleWidget,
      context: {
        screenId: "main",
      },
      reason: 'No widget definition registered for kind "command-button".',
    });
  });

  it("renders all widget descriptors for a screen", () => {
    const registry = createDefaultWidgetRegistry();

    expect(renderScreenDescriptors(sampleScreen, registry)).toHaveLength(1);
  });
});

describe("widget capability metadata", () => {
  it("provides default definitions for every Bloom widget kind", () => {
    expect([...WIDGET_KINDS].sort()).toEqual(contractWidgetKinds);
    expect(DEFAULT_WIDGET_DEFINITIONS.map((definition) => definition.kind).sort()).toEqual(contractWidgetKinds);
  });

  it("exposes catalog-ready metadata for future editors", () => {
    const registry = createDefaultWidgetRegistry();
    const joystick = registry.get("joystick");

    expect(joystick).toMatchObject({
      availability: {
        editor: true,
        runtime: true,
      },
      category: "input",
      defaultLayout: {
        height: 332,
        minHeight: 160,
        minWidth: 160,
        width: 280,
      },
      defaultSettings: {
        binding: "joy",
        deadzone: 0.1,
        show_details: false,
      },
      defaultTitle: "Joystick",
      displayName: "Joystick",
      editor: {
        movable: true,
        resizable: true,
        settings: true,
        styleFields: ["accentColor", "backgroundColor"],
      },
      runtimeRequirements: ["teleop-adapter"],
    });
  });

  it("keeps 3D robot visualization as an optional widget family", () => {
    const robotView = createDefaultWidgetRegistry().get("robot-3d");

    expect(robotView).toMatchObject({
      availability: {
        editor: true,
        runtime: true,
      },
      category: "display",
      defaultLayout: {
        height: 320,
        minHeight: 220,
        minWidth: 280,
        width: 460,
      },
      defaultSettings: {
        jointStateTopic: "/joint_states",
        modelSource: "extension",
        showAxes: true,
      },
      displayName: "3D robot view",
      // `robot-model-source` was dropped: nothing implemented it, and the
      // widget draws a joint-state summary rather than loading a model, which
      // is what `preview` now says out loud.
      maturity: "preview",
      runtimeRequirements: ["data-source"],
    });
  });

  it("describes per-widget editor capabilities", () => {
    const registry = createDefaultWidgetRegistry();

    expect(registry.get("label")?.editor.styleFields).toEqual(["backgroundColor", "textColor"]);
    expect(registry.get("camera")?.editor.styleFields).toEqual(["borderColor"]);
    expect(registry.get("unknown")?.editor).toEqual({
      movable: false,
      resizable: false,
      settings: false,
      styleFields: [],
    });
  });

  it("groups widget definitions by category", () => {
    const commandWidgets = [...createDefaultWidgetRegistry().values()].filter(
      (definition) => definition.category === "command",
    );

    expect(commandWidgets.map((definition) => definition.kind).sort()).toEqual([
      "button",
      "command-button",
      "position-library",
    ]);
  });

  it("creates widget configs from capability defaults", () => {
    const definition = createDefaultWidgetRegistry().get("slider") as WidgetDefinition;

    expect(
      createWidgetConfigFromDefinition(definition, "speed-slider", {
        settings: { max: 3, min: 0 },
        title: "Speed",
      }),
    ).toEqual({
      id: "speed-slider",
      kind: "slider",
      title: "Speed",
      layout: {
        x: 0,
        y: 0,
        width: 120,
        height: 284,
      },
      settings: {
        direction: "vertical",
        intent_label: "",
        max: 3,
        min: 0,
        returnToCenter: false,
        show_details: false,
        step: 0.01,
        unit: "",
        value: 0,
      },
    });
  });
});

describe("canvas layout foundation", () => {
  it("snaps layout values to the grid used by the editor", () => {
    expect(snapLayoutValue(13)).toBe(16);
    expect(snapLayoutValue(12)).toBe(16);
    expect(snapLayoutValue(12, 0)).toBe(12);
  });

  it("resolves canvas preset sizes from canonical settings", () => {
    expect(resolveCanvasPresetSize({ preset_id: "tablet", runtime_mode: "fit" })).toEqual({
      width: 1280,
      height: 800,
    });
  });

  it("expands the artboard when widgets extend past the selected preset", () => {
    const widget = createWidgetConfigFromDefinition(
      createDefaultWidgetRegistry().get("camera") as WidgetDefinition,
      "camera",
      {
        layout: {
          x: 1800,
          y: 1000,
          width: 360,
          height: 260,
        },
      },
    );

    expect(resolveCanvasArtboardSize([widget], { preset_id: "hd", runtime_mode: "fit" })).toEqual({
      width: 2184,
      height: 1284,
    });
  });

  it("resolves fit scale only for fit runtime mode", () => {
    expect(
      resolveCanvasFitScale(
        { preset_id: "hd", runtime_mode: "fit" },
        { width: 1280, height: 720 },
        { width: 640, height: 720 },
      ),
    ).toBe(0.5);
    expect(
      resolveCanvasFitScale(
        { preset_id: "hd", runtime_mode: "center" },
        { width: 1280, height: 720 },
        { width: 640, height: 720 },
      ),
    ).toBe(1);
  });

  it("resolves operator-fit scale without overflowing the viewport", () => {
    expect(
      resolveCanvasFitScale(
        { preset_id: "wide-tablet", runtime_mode: "operator-fit" },
        { width: 1820, height: 720 },
        { width: 910, height: 360 },
      ),
    ).toBe(0.5);
  });

  it("converts legacy rect values without losing coordinates", () => {
    expect(legacyRectToLayout({ x: 394, y: 17, w: 203, h: 91 })).toEqual({
      x: 394,
      y: 17,
      width: 203,
      height: 91,
    });
  });
});

describe("widget settings contracts", () => {
  it("provides settings contracts for every Bloom widget kind", () => {
    expect(Object.keys(WIDGET_SETTINGS_CONTRACTS).sort()).toEqual([
      "button",
      "camera",
      "command-button",
      "event-log",
      "gauge",
      "gesture-pad",
      "jacobian",
      "joint-table",
      "joystick",
      "label",
      "plot",
      "plot-board",
      "plot-picker",
      "position-library",
      "robot-3d",
      "slider",
      "toggle",
      "topic-echo",
      "topic-plot",
      "unknown",
      "value-strip",
    ]);
  });

  it("falls back to the unknown settings contract for unsupported runtime kinds", () => {
    expect(getWidgetSettingsContract("legacy-special" as never)).toEqual(WIDGET_SETTINGS_CONTRACTS.unknown);
  });

  it("normalizes partial settings with widget defaults", () => {
    expect(normalizeWidgetSettings("slider", { max: 3, min: 0 })).toEqual({
      success: true,
      settings: {
        direction: "vertical",
        intent_label: "",
        max: 3,
        min: 0,
        returnToCenter: false,
        show_details: false,
        step: 0.01,
        unit: "",
        value: 0,
      },
    });
  });

  it("derives a slider step of about twenty round increments from the range", () => {
    expect(deriveSliderStep(-1, 1)).toBe(0.1);
    expect(deriveSliderStep(0, 1)).toBe(0.05);
    expect(deriveSliderStep(0, 0.5)).toBe(0.025);
    expect(deriveSliderStep(-1, 9)).toBe(0.5);
    expect(deriveSliderStep(0, 100)).toBe(5);
  });

  it("falls back to the contract default step for a degenerate range", () => {
    expect(deriveSliderStep(1, 1)).toBe(0.01);
    expect(deriveSliderStep(0, Number.POSITIVE_INFINITY)).toBe(0.01);
  });

  it("accepts the snake_case slider keys configs in the wild carry", () => {
    expect(
      normalizeWidgetSettings("slider", { max: 1, min: -1, orientation: "horizontal", return_to_center: true }),
    ).toMatchObject({
      success: true,
      settings: {
        direction: "horizontal",
        returnToCenter: true,
      },
    });
  });

  it("lets canonical slider keys win over their legacy aliases", () => {
    expect(
      normalizeWidgetSettings("slider", {
        direction: "vertical",
        max: 1,
        min: -1,
        orientation: "horizontal",
        return_to_center: true,
        returnToCenter: false,
      }),
    ).toMatchObject({
      success: true,
      settings: {
        direction: "vertical",
        returnToCenter: false,
      },
    });
  });

  it("keeps slider unit and operator intent settings optional but valid", () => {
    expect(
      validateWidgetSettings("slider", {
        direction: "horizontal",
        intent_label: "Vertical velocity",
        max: 1,
        min: -1,
        returnToCenter: true,
        show_details: false,
        step: 0.01,
        unit: "m/s",
      }),
    ).toEqual({
      success: true,
      settings: {
        direction: "horizontal",
        intent_label: "Vertical velocity",
        max: 1,
        min: -1,
        returnToCenter: true,
        show_details: false,
        step: 0.01,
        unit: "m/s",
      },
    });
  });

  it("normalizes gesture pad settings with operator-facing details hidden by default", () => {
    expect(
      normalizeWidgetSettings("gesture-pad", {
        command: "petanque.throw.preview",
        topic: "/petanque/throw/gesture",
      }),
    ).toEqual({
      success: true,
      settings: {
        angleLabel: "Angle",
        command: "petanque.throw.preview",
        messageType: "",
        powerLabel: "Power",
        show_details: false,
        topic: "/petanque/throw/gesture",
      },
    });
  });

  it("reports clear validation errors for invalid settings", () => {
    expect(
      validateWidgetSettings("slider", { direction: "sideways", max: 0, min: 1, returnToCenter: false, step: 0 }),
    ).toEqual({
      success: false,
      errors: [
        {
          field: "step",
          message: "step must be greater than 0",
        },
        {
          field: "direction",
          message: "direction must be one of: horizontal, vertical",
        },
        {
          field: "show_details",
          message: "show_details must be a boolean",
        },
        {
          field: "max",
          message: "max must be greater than min",
        },
      ],
    });
  });

  it("validates camera source settings for local webcam demos and stream previews", () => {
    expect(
      normalizeWidgetSettings("camera", {
        source: "webcam",
        streamUrl: "webcam:///dev/video0",
      }),
    ).toEqual({
      success: true,
      settings: {
        fitMode: "contain",
        showHeader: true,
        showStatus: true,
        source: "webcam",
        streamUrl: "webcam:///dev/video0",
        topic: "",
        webcamPicker: true,
      },
    });

    expect(
      validateWidgetSettings("camera", {
        fitMode: "contain",
        showHeader: true,
        showStatus: true,
        source: "ros-camera",
        streamUrl: "",
        topic: "",
        webcamPicker: true,
      }),
    ).toEqual({
      success: false,
      errors: [
        {
          field: "source",
          message: "source must be one of: placeholder, ros-topic, stream-url, webcam",
        },
      ],
    });
  });

  it("validates structured joystick labels", () => {
    expect(
      normalizeWidgetSettings("joystick", {
        binding: "joy",
        deadzone: 0.1,
        labels: {
          bottom: "Y-",
          left: "X-",
          right: "X+",
          top: 42,
        },
      }),
    ).toEqual({
      success: false,
      errors: [
        {
          field: "labels.top",
          message: "top label must be a string",
        },
      ],
    });
  });

  it("normalizes legacy rotation joystick bindings into mode-aware contracts", () => {
    expect(
      normalizeWidgetSettings("joystick", {
        binding: "rot",
      }),
    ).toEqual({
      success: true,
      settings: expect.objectContaining({
        binding: "rot",
        mode_id: "rotation",
        publish_rate_hz: 30,
        runtime_binding: {
          adapter: "teleop",
          target: "rotation",
        },
        zero_on_release: true,
      }),
    });
  });

  it("keeps an authored runtime binding that targets both axes", () => {
    const runtimeBinding = {
      adapter: "teleop",
      axis_deadzone: 0.2,
      axis_mapping: { x: { component: "linear_y" }, y: { component: "linear_z" } },
      frame_id: "ft_frame",
      target: "both",
      value_mapping: { mode: 3, target_topic: "/joystick_cartesian_command" },
    };

    for (const binding of ["joy", "rot"]) {
      const result = normalizeWidgetSettings("joystick", { binding, runtime_binding: runtimeBinding });
      expect(result.success && result.settings.runtime_binding).toEqual(runtimeBinding);
    }
  });

  it("rejects a zero slider step, which leaves the slider emitting nothing", () => {
    const result = normalizeWidgetSettings("slider", { max: 1, min: -1, step: 0 });

    expect(result.success).toBe(false);
    expect(result.success ? [] : result.errors).toContainEqual({
      field: "step",
      message: "step must be greater than 0",
    });
  });

  it("rejects joystick rates above the aggregate runtime wire limit", () => {
    expect(normalizeWidgetSettings("joystick", { publish_rate_hz: 31 })).toEqual({
      success: false,
      errors: [
        {
          field: "publish_rate_hz",
          message: "publish_rate_hz must be less than or equal to 30",
        },
      ],
    });
  });

  it("validates plot board series", () => {
    expect(
      normalizeWidgetSettings("plot-board", { series: [{ topic: "/cartesian_command", field_path: "twist.linear.x" }] })
        .success,
    ).toBe(true);
    expect(normalizeWidgetSettings("plot-board", { series: [{ topic: "cartesian_command" }] })).toEqual({
      success: false,
      errors: [{ field: "series", message: "series 1 needs an absolute topic and a field_path" }],
    });
    expect(normalizeWidgetSettings("plot-board", { series: [], y_min: 1, y_max: 1 }).success).toBe(false);
  });

  it("validates topic plot debug settings", () => {
    expect(
      normalizeWidgetSettings("topic-plot", {
        fieldPath: "velocity.x",
        messageType: "geometry_msgs/msg/Twist",
        topic: "/cartesian_command",
        unit: "m/s",
      }),
    ).toEqual({
      success: true,
      settings: {
        fieldPath: "velocity.x",
        historySeconds: 30,
        maxSamples: 500,
        messageType: "geometry_msgs/msg/Twist",
        show_details: true,
        topic: "/cartesian_command",
        unit: "m/s",
        variant: "area",
      },
    });

    expect(
      validateWidgetSettings("topic-plot", {
        fieldPath: "",
        historySeconds: 0,
        maxSamples: 10,
        messageType: "",
        show_details: true,
        topic: "",
        unit: "",
        variant: "pie",
        yMax: 1,
        yMin: 1,
      }),
    ).toEqual({
      success: false,
      errors: [
        {
          field: "topic",
          message: "topic is required",
        },
        {
          field: "fieldPath",
          message: "fieldPath is required",
        },
        {
          field: "historySeconds",
          message: "historySeconds must be greater than or equal to 1",
        },
        {
          field: "variant",
          message: "variant must be one of: area, bars, sparkline",
        },
        {
          field: "yMax",
          message: "yMax must be greater than yMin",
        },
      ],
    });
  });

  it("validates topic echo debug settings", () => {
    expect(
      normalizeWidgetSettings("topic-echo", {
        fieldPath: "",
        messageType: "sensor_msgs/msg/JointState",
        topic: "/joint_states",
      }),
    ).toEqual({
      success: true,
      settings: {
        fieldPath: "",
        maxMessages: 100,
        messageType: "sensor_msgs/msg/JointState",
        prettyPrint: true,
        show_details: true,
        topic: "/joint_states",
      },
    });

    expect(
      normalizeWidgetSettings("camera", {
        source: "rviz",
        streamUrl: "webrtc://localhost:8001/rviz",
      }),
    ).toEqual({
      success: true,
      settings: {
        fitMode: "contain",
        showHeader: true,
        showStatus: true,
        source: "stream-url",
        streamUrl: "webrtc://localhost:8001/rviz",
        topic: "",
        webcamPicker: true,
      },
    });
  });

  it("validates display widgets that replaced legacy placeholders", () => {
    expect(
      normalizeWidgetSettings("gauge", {
        max: 100,
        min: 0,
        unit: "%",
        value: 68,
      }),
    ).toEqual({
      success: true,
      settings: {
        fieldPath: "data",
        max: 100,
        messageType: "",
        min: 0,
        show_details: false,
        topic: "",
        unit: "%",
        value: 68,
      },
    });

    expect(
      normalizeWidgetSettings("plot", {
        historySeconds: 20,
        samples: [0.1, 0.4, 0.3],
      }),
    ).toEqual({
      success: true,
      settings: {
        fieldPath: "data",
        historySeconds: 20,
        maxSamples: 500,
        messageType: "",
        samples: [0.1, 0.4, 0.3],
        show_details: false,
        showLegend: true,
        topic: "",
        unit: "",
        variant: "area",
      },
    });

    expect(
      normalizeWidgetSettings("plot", {
        historySeconds: 15,
        samples: [0, 1, 0.5],
        unit: "m/s",
        variant: "bars",
        yMax: 1,
        yMin: 0,
      }),
    ).toEqual({
      success: true,
      settings: {
        fieldPath: "data",
        historySeconds: 15,
        maxSamples: 500,
        messageType: "",
        samples: [0, 1, 0.5],
        show_details: false,
        showLegend: true,
        topic: "",
        unit: "m/s",
        variant: "bars",
        yMax: 1,
        yMin: 0,
      },
    });
  });

  it("validates generic event log settings for operator-facing feedback", () => {
    expect(
      normalizeWidgetSettings("event-log", {
        entries: [
          {
            detail: "The safety-zone adapter accepted the new limit.",
            severity: "success",
            summary: "Safety zone updated",
            timestamp: "2026-06-04T10:00:00.000Z",
          },
          {
            severity: "warning",
            summary: "Joystick deadzone reached",
          },
        ],
        fieldPath: "",
        maxEntries: 4,
        messageType: "",
        severityFilter: ["success", "warning"],
        showTimestamps: true,
        show_details: false,
        topic: "",
      }),
    ).toEqual({
      success: true,
      settings: {
        entries: [
          {
            detail: "The safety-zone adapter accepted the new limit.",
            severity: "success",
            summary: "Safety zone updated",
            timestamp: "2026-06-04T10:00:00.000Z",
          },
          {
            severity: "warning",
            summary: "Joystick deadzone reached",
          },
        ],
        fieldPath: "",
        maxEntries: 4,
        messageType: "",
        severityFilter: ["success", "warning"],
        showTimestamps: true,
        show_details: false,
        topic: "",
      },
    });

    expect(
      validateWidgetSettings("event-log", {
        entries: "not-json-array",
        fieldPath: "",
        maxEntries: 0,
        messageType: "",
        severityFilter: ["info"],
        showTimestamps: true,
        show_details: false,
        topic: "",
      }),
    ).toEqual({
      success: false,
      errors: [
        {
          field: "entries",
          message: "entries must be an array",
        },
        {
          field: "maxEntries",
          message: "maxEntries must be greater than or equal to 1",
        },
      ],
    });
  });

  it("rejects invalid settings when creating a widget config from defaults", () => {
    const definition = createDefaultWidgetRegistry().get("slider") as WidgetDefinition;

    expect(() =>
      createWidgetConfigFromDefinition(definition, "bad-slider", {
        settings: {
          direction: "vertical",
          max: 1,
          min: -1,
          step: -1,
        },
      }),
    ).toThrow('Invalid settings for widget kind "slider": step: step must be greater than or equal to 0');
  });

  it("adds every palette widget from its defaults, leaving a topic or plot to name unset", () => {
    const registry = createDefaultWidgetRegistry();
    const palette = [...registry.values()].filter((definition) => definition.availability.editor);

    const empty = { ...sampleScreen, widgets: [] };
    for (const definition of palette) {
      expect(() => addWidgetToScreen(empty, definition, { id: definition.kind }), definition.kind).not.toThrow();
    }
    const topicPlot = registry.get("topic-plot") as WidgetDefinition;
    expect(addWidgetToScreen(empty, topicPlot, { id: "plot" }).widgets[0]?.settings.topic).toBe("");
    expect(() => addWidgetToScreen(empty, topicPlot, { id: "plot", settings: {} })).toThrow("topic: topic is required");
  });

  it("offers nothing in the palette that has no settings to fill in", () => {
    // `button` sat first in the command category marked ready, with an empty contract and the same
    // renderer as `command-button`. An author picked it, found a blank inspector, and had no way to
    // make it send or navigate anything.
    const blank = [...createDefaultWidgetRegistry().values()]
      .filter((definition) => definition.availability.editor && definition.kind !== "unknown")
      .filter((definition) => getWidgetSettingsContract(definition.kind).fields.length === 0)
      .map((definition) => definition.kind);

    expect(blank).toEqual([]);
  });

  it("keeps ROS message toggle presets available for non-web users", () => {
    expect(ROS_MESSAGE_TOGGLE_PRESETS.map((preset) => preset.id)).toContain("digital-output-array");
    expect(getDefaultRosMessageTogglePayloads("std_msgs/msg/Int32MultiArray")).toEqual({
      onPayload: "{data: [13, 1]}",
      offPayload: "{data: [13, 0]}",
    });
  });

  it("keeps one-shot ROS message command presets available for non-web users", () => {
    expect(ROS_MESSAGE_COMMAND_PRESETS.map((preset) => preset.id)).toEqual(
      expect.arrayContaining([
        "state-machine-activate-throw",
        "emergency-stop-bool",
        "digital-output-on",
        "saved-position-save-current",
        "saved-position-replay-selected",
        "saved-position-cancel-motion",
      ]),
    );
    expect(
      getRosMessageCommandPresetsByCategory()
        .get("saved-preset")
        ?.map((preset) => preset.id),
    ).toEqual(["saved-position-save-current", "saved-position-replay-selected"]);

    expect(
      normalizeWidgetSettings("command-button", {
        button_label: "Stop",
        command: "emergency_stop",
        messageType: "std_msgs/msg/Bool",
        payload: "{data: true}",
        presetId: "emergency-stop-bool",
        topic: "/explorer/emergency_stop",
      }),
    ).toEqual({
      success: true,
      settings: expect.objectContaining({
        button_label: "Stop",
        command: "emergency_stop",
        messageType: "std_msgs/msg/Bool",
        payload: "{data: true}",
        presetId: "emergency-stop-bool",
        topic: "/explorer/emergency_stop",
      }),
    });
  });
});

describe("topic telemetry primitives", () => {
  it("resolves nested field paths including array indices", () => {
    expect(
      resolveFieldPath(
        {
          effort: [0.1, 0.2],
          velocity: {
            angular: {
              z: -0.5,
            },
          },
        },
        "velocity.angular.z",
      ),
    ).toBe(-0.5);
    expect(resolveFieldPath({ effort: [0.1, 0.2] }, "effort[1]")).toBe(0.2);
    expect(resolveFieldPath({ effort: [0.1, 0.2] }, "effort[3]")).toBeUndefined();
  });

  it("appends topic echo messages while preserving a bounded buffer", () => {
    const settings = {
      fieldPath: "data",
      maxMessages: 2,
    };
    const messages = [
      createTopicMessage("2026-06-02T10:00:00.000Z", { data: "first" }),
      createTopicMessage("2026-06-02T10:00:01.000Z", { data: "second" }),
      createTopicMessage("2026-06-02T10:00:02.000Z", { data: "third" }),
    ].reduce<TopicMessage[]>(
      (previousMessages, message) => appendTopicEchoMessage(previousMessages, message, settings),
      [],
    );

    expect(messages.map((message) => message.value)).toEqual(["second", "third"]);
  });

  it("formats topic echo payloads for console-like displays", () => {
    expect(formatTopicEchoValue({ data: [13, 1] }, true)).toBe('{\n  "data": [\n    13,\n    1\n  ]\n}');
    expect(formatTopicEchoValue("already text", true)).toBe("already text");
  });

  it("appends numeric topic plot samples and trims stale data", () => {
    const settings = {
      fieldPath: "velocity.x",
      historySeconds: 2,
      maxSamples: 3,
    };
    const samples = [
      createTopicMessage("2026-06-02T10:00:00.000Z", { velocity: { x: 0.1 } }),
      createTopicMessage("2026-06-02T10:00:01.000Z", { velocity: { x: 0.2 } }),
      createTopicMessage("2026-06-02T10:00:03.000Z", { velocity: { x: 0.3 } }),
      createTopicMessage("2026-06-02T10:00:04.000Z", { velocity: { x: "bad" } }),
    ].reduce<TopicPlotSample[]>(
      (previousSamples, message) => appendTopicPlotSample(previousSamples, message, settings),
      [],
    );

    expect(samples).toEqual([
      {
        timestamp: "2026-06-02T10:00:01.000Z",
        value: 0.2,
      },
      {
        timestamp: "2026-06-02T10:00:03.000Z",
        value: 0.3,
      },
    ]);
  });
});

describe("legacy widget kind mapping", () => {
  it("maps reusable extender_ui widgets to Bloom generic kinds", () => {
    expect(resolveLegacyWidgetKind("joystick").bloomKind).toBe("joystick");
    expect(resolveLegacyWidgetKind("slider").bloomKind).toBe("slider");
    expect(resolveLegacyWidgetKind("button").bloomKind).toBe("command-button");
    expect(resolveLegacyWidgetKind("text").bloomKind).toBe("label");
    expect(resolveLegacyWidgetKind("stream-display").bloomKind).toBe("camera");
    expect(resolveLegacyWidgetKind("curves").bloomKind).toBe("plot");
    expect(resolveLegacyWidgetKind("logs").bloomKind).toBe("event-log");
    expect(resolveLegacyWidgetKind("throw-draw").bloomKind).toBe("gesture-pad");
    expect(resolveLegacyWidgetKind("topic-monitor").bloomKind).toBe("topic-echo");
  });

  it("marks ROS and device widgets as adapter-dependent", () => {
    expect(resolveLegacyWidgetKind("ros-message-toggle")).toMatchObject({
      bloomKind: "toggle",
      compatibility: "adapter-required",
    });
    expect(resolveLegacyWidgetKind("gripper-control")).toMatchObject({
      bloomKind: "toggle",
      compatibility: "adapter-required",
    });
    expect(resolveLegacyWidgetKind("max-velocity")).toMatchObject({
      bloomKind: "slider",
      compatibility: "adapter-required",
    });
    expect(resolveLegacyWidgetKind("momentary-ros-message")).toMatchObject({
      bloomKind: "command-button",
      compatibility: "adapter-required",
    });
  });

  it("maps trajectory-like legacy widgets to reusable generic contracts", () => {
    expect(resolveLegacyWidgetKind("throw-draw")).toMatchObject({
      bloomKind: "gesture-pad",
      compatibility: "renamed",
    });
    expect(resolveLegacyWidgetKind("drink")).toMatchObject({
      bloomKind: "command-button",
      compatibility: "adapter-required",
    });
  });

  it("returns an explicit unsupported mapping for unknown legacy kinds", () => {
    expect(resolveLegacyWidgetKind("imaginary-widget")).toEqual({
      legacyKind: "imaginary-widget",
      bloomKind: "unknown",
      compatibility: "unsupported",
      displayName: "imaginary-widget",
      notes: 'No legacy widget mapping is registered for kind "imaginary-widget".',
    });
  });

  it("documents every enabled extender_ui widget kind", () => {
    const enabledExtenderUiKinds = [
      "joystick",
      "slider",
      "mode-button",
      "save-pose-button",
      "load-pose-button",
      "navigation-button",
      "navigation-bar",
      "text",
      "textarea",
      "button",
      "rosbag-control",
      "max-velocity",
      "momentary-ros-message",
      "gripper-control",
      "magnet-control",
      "toggle-publisher",
      "ros-message-toggle",
      "stream-display",
      "throw-draw",
      "topic-monitor",
      "drink",
      "curves",
      "logs",
    ];

    expect(Object.keys(LEGACY_WIDGET_KIND_MAPPINGS).sort()).toEqual(enabledExtenderUiKinds.sort());
  });

  it("points reusable legacy mappings to existing Bloom capabilities", () => {
    const registry = createDefaultWidgetRegistry();
    const mappedKinds = Object.values(LEGACY_WIDGET_KIND_MAPPINGS)
      .filter((mapping) => mapping.bloomKind !== "unknown")
      .map((mapping) => mapping.bloomKind);

    expect(mappedKinds.every((kind) => registry.has(kind))).toBe(true);
  });
});

describe("legacy canvas configuration adapter", () => {
  it("converts real legacy sandbox canvas JSON into Bloom screen config", () => {
    const screen = legacyCanvasScreenToConfig(legacySandboxScreen);

    expect(screen).toMatchObject({
      id: "sandbox_control",
      title: "sandbox_control",
      canvas: {
        preset_id: "hd",
        runtime_mode: "fit",
      },
    });
    expect(screen.widgets).toHaveLength(12);

    const rosToggle = screen.widgets.find((widget) => widget.id === "widget-1777993123607-1d1c3");
    expect(rosToggle).toMatchObject({
      kind: "toggle",
      title: "ROS Toggle",
      layout: {
        x: 394,
        y: 17,
        width: 203,
        height: 91,
      },
      settings: {
        legacyKind: "ros-message-toggle",
        messageType: "std_msgs/msg/Int32MultiArray",
        onPayload: "{data: [13, 1]}",
        topic: "/ui/ros_toggle",
      },
    });
    expect(rosToggle?.settings).not.toHaveProperty("rect");
  });

  it("keeps unsupported legacy widgets visible as unknown", () => {
    const screen = legacyCanvasScreenToConfig(legacyConfigurationsScreen);
    const navigation = screen.widgets.find((widget) => widget.id === "cfg-nav");

    expect(navigation).toMatchObject({
      kind: "unknown",
      title: "All Pages",
      settings: {
        legacyKind: "navigation-bar",
        orientation: "vertical",
      },
    });
    const navigationItems = navigation?.settings.items as Array<{ targetScreenId: string }> | undefined;
    expect(navigationItems?.[0]?.targetScreenId).toBe("default_control");
  });

  it("converts real legacy screens into a Bloom configuration bundle", () => {
    const bundle = legacyBundleFrom([legacyConfigurationsScreen, legacySandboxScreen], {
      application: legacyPetanqueApplication,
      exportedAt: "2026-06-02T10:00:00.000Z",
    });

    expect(bundle).toMatchObject({
      metadata: {
        schema_version: 1,
        exported_at: "2026-06-02T10:00:00.000Z",
        source: "extender_ui_legacy",
      },
      applications: [
        {
          id: "application-play-petanque",
          name: "PlayPetanque",
        },
      ],
    });
    expect(bundle.applications[0]?.screens.map((screen) => screen.id)).toEqual(["configurations", "sandbox_control"]);
    expect(bundle.applications[0]?.runtime_policy.allowed_service_calls).toEqual([]);
    expect(bundle.applications[0]?.screens.flatMap((screen) => screen.widgets)).toHaveLength(
      legacyConfigurationsScreen.widgets.length + legacySandboxScreen.widgets.length,
    );
  });

  it("orders converted screens using legacy application screen ids when available", () => {
    const application = legacyCanvasScreensToApplicationConfig([legacySandboxScreen, legacyConfigurationsScreen], {
      id: "debug",
      name: "Debug",
      screenIds: ["configurations", "sandbox_control"],
    });

    expect(application.screens.map((screen) => screen.id)).toEqual(["configurations", "sandbox_control"]);
  });
});

describe("legacy migration integration", () => {
  it("round trips real legacy JSON through the frontend API client and widget registry", async () => {
    const bundle = legacyBundleFrom([legacyConfigurationsScreen, legacySandboxScreen], {
      application: legacyPetanqueApplication,
      exportedAt: "2026-06-02T10:00:00.000Z",
    });
    const client = createBloomApiClient({ fetcher: createInMemoryConfigurationFetcher() });

    await client.upsertConfiguration("legacy-petanque", bundle);
    const storedBundle = await client.getConfiguration("legacy-petanque");
    const sandboxScreen = storedBundle.applications[0]?.screens.find((screen) => screen.id === "sandbox_control");
    if (!sandboxScreen) throw new Error("Missing sandbox screen.");

    const descriptors = renderScreenDescriptors(sandboxScreen, createDefaultWidgetRegistry());

    expect(storedBundle.metadata.source).toBe("extender_ui_legacy");
    expect(sandboxScreen.widgets).toHaveLength(12);
    expect(descriptors).toHaveLength(12);
    expect(descriptors.some((descriptor) => descriptor.status === "unknown")).toBe(false);
    expect(descriptors.map((descriptor) => descriptor.widget.id)).toContain("widget-1777993123607-1d1c3");
  });
});

describe("widget editor operations", () => {
  it("adds widgets from capability defaults without mutating the original screen", () => {
    const definition = createDefaultWidgetRegistry().get("label") as WidgetDefinition;
    const nextScreen = addWidgetToScreen(sampleScreen, definition, {
      id: "title",
      title: "Title",
      settings: { text: "Hello Bloom" },
    });

    expect(sampleScreen.widgets).toHaveLength(1);
    expect(nextScreen.widgets).toHaveLength(2);
    expect(nextScreen.widgets[1]).toMatchObject({
      id: "title",
      kind: "label",
      title: "Title",
      layout: {
        x: 0,
        y: 0,
        width: 280,
        height: 64,
      },
      settings: {
        align: "left",
        fontSize: 20,
        text: "Hello Bloom",
      },
    });
  });

  it("updates widget title and settings while preserving other fields", () => {
    const renamedScreen = updateWidgetTitle(sampleScreen, "toggle", "Digital output");
    const updatedScreen = updateWidgetSettings(renamedScreen, "toggle", {
      initialValue: false,
      messageType: "std_msgs/msg/Int32MultiArray",
      onPayload: "{data: [13, 1]}",
      offPayload: "{data: [13, 0]}",
      topic: "/ui/ros_toggle",
    });

    expect(updatedScreen.widgets[0]).toMatchObject({
      id: "toggle",
      title: "Digital output",
      layout: sampleWidget.layout,
      settings: {
        messageType: "std_msgs/msg/Int32MultiArray",
        topic: "/ui/ros_toggle",
      },
    });
  });

  it("removes widgets by id", () => {
    expect(removeWidgetFromScreen(sampleScreen, "toggle").widgets).toEqual([]);
  });

  it("duplicates widgets with cloned settings and an offset layout", () => {
    const nextScreen = duplicateWidgetInScreen(sampleScreen, "toggle", {
      id: "toggle-copy",
      title: "Digital output copy",
    });

    expect(nextScreen.widgets).toHaveLength(2);
    expect(nextScreen.widgets[1]).toEqual({
      ...sampleWidget,
      id: "toggle-copy",
      title: "Digital output copy",
      layout: {
        ...sampleWidget.layout,
        x: sampleWidget.layout.x + 24,
        y: sampleWidget.layout.y + 24,
      },
      settings: sampleWidget.settings,
    });
    expect(nextScreen.widgets[1]?.settings).not.toBe(sampleWidget.settings);
  });

  it("rejects duplicated widgets with an existing id", () => {
    expect(() => duplicateWidgetInScreen(sampleScreen, "toggle", { id: "toggle" })).toThrow(
      'Widget "toggle" already exists on screen "main".',
    );
  });

  it("rejects invalid editor settings with field-level context", () => {
    const toggleScreen = addWidgetToScreen(
      sampleScreen,
      createDefaultWidgetRegistry().get("toggle") as WidgetDefinition,
      {
        id: "device-toggle",
      },
    );

    expect(() =>
      updateWidgetSettings(toggleScreen, "device-toggle", {
        initialValue: "nope",
        onPayload: true,
        offPayload: false,
      }),
    ).toThrow('Invalid settings for widget "device-toggle": initialValue: initialValue must be a boolean');
  });
});

describe("widget runtime action intents", () => {
  it("creates command intents for configured command buttons", () => {
    expect(
      createWidgetActionIntent(
        createWidgetConfigFromDefinition(
          createDefaultWidgetRegistry().get("command-button") as WidgetDefinition,
          "run",
          {
            settings: { command: "activate_throw" },
          },
        ),
        { type: "press" },
      ),
    ).toEqual({
      type: "command",
      widgetId: "run",
      widgetKind: "command-button",
      command: "activate_throw",
    });
  });

  it("creates local frame-selection intents without inventing a backend command", () => {
    expect(
      createWidgetActionIntent(
        createWidgetConfigFromDefinition(
          createDefaultWidgetRegistry().get("command-button") as WidgetDefinition,
          "frame-tool",
          {
            settings: {
              runtime_binding: { adapter: "teleop-frame", frame_id: "effector_frame" },
            },
          },
        ),
        { type: "press" },
      ),
    ).toEqual({
      type: "command",
      widgetId: "frame-tool",
      widgetKind: "command-button",
      command: "set-teleop-frame",
      runtimeBinding: { adapter: "teleop-frame", frame_id: "effector_frame" },
    });
  });

  it("adds progress and cancellation metadata to long-running command intents", () => {
    expect(
      createWidgetActionIntent(
        createWidgetConfigFromDefinition(
          createDefaultWidgetRegistry().get("command-button") as WidgetDefinition,
          "deploy",
          {
            settings: {
              action_feedback: "progress",
              action_id: "explorer.deploy",
              action_label: "Deploy robot",
              cancellable: true,
              command: "deploy",
            },
          },
        ),
        { type: "press" },
      ),
    ).toEqual({
      type: "command",
      widgetId: "deploy",
      widgetKind: "command-button",
      command: "deploy",
      action: {
        actionId: "explorer.deploy",
        cancellable: true,
        expectedFeedback: "progress",
        label: "Deploy robot",
      },
    });
  });

  it("creates screen navigation intents for legacy navigation command buttons", () => {
    expect(
      createWidgetActionIntent(
        createWidgetConfigFromDefinition(
          createDefaultWidgetRegistry().get("command-button") as WidgetDefinition,
          "open-monitor",
          {
            settings: {
              command: "navigate_screen",
              messageType: "std_msgs/msg/String",
              payload: { data: "visual_servoing_monitor" },
              targetScreenId: "visual_servoing_monitor",
              topic: "/ui/navigation/visual_servoing_monitor",
            },
          },
        ),
        { type: "press" },
      ),
    ).toEqual({
      type: "screen-navigation",
      widgetId: "open-monitor",
      widgetKind: "command-button",
      targetScreenId: "visual_servoing_monitor",
    });
  });

  it("navigates on a target screen alone, without the legacy command string", () => {
    // Petanque admin's two Home buttons name a screen and no command, so they published an empty
    // message to /ui/navigation and stayed where they were.
    expect(
      createWidgetActionIntent(
        createWidgetConfigFromDefinition(
          createDefaultWidgetRegistry().get("button") as WidgetDefinition,
          "live-back-home",
          { settings: { icon: "home", targetScreenId: "default_home", topic: "/ui/navigation" } },
        ),
        { type: "press" },
      ),
    ).toEqual({
      type: "screen-navigation",
      widgetId: "live-back-home",
      widgetKind: "button",
      targetScreenId: "default_home",
    });
  });

  it("creates topic publish intents for one-shot ROS message command buttons", () => {
    expect(
      createWidgetActionIntent(
        createWidgetConfigFromDefinition(
          createDefaultWidgetRegistry().get("command-button") as WidgetDefinition,
          "emergency-stop",
          {
            settings: {
              button_label: "Stop",
              command: "emergency_stop",
              messageType: "std_msgs/msg/Bool",
              payload: "{data: true}",
              presetId: "emergency-stop-bool",
              topic: "/explorer/emergency_stop",
            },
          },
        ),
        { type: "press" },
      ),
    ).toEqual({
      type: "topic-publish",
      widgetId: "emergency-stop",
      widgetKind: "command-button",
      topic: "/explorer/emergency_stop",
      messageType: "std_msgs/msg/Bool",
      payload: "{data: true}",
      payloadText: "{data: true}",
    });
  });

  it("creates topic publish intents for ROS message toggles", () => {
    expect(
      createWidgetActionIntent(
        createWidgetConfigFromDefinition(
          createDefaultWidgetRegistry().get("toggle") as WidgetDefinition,
          "digital-output",
          {
            settings: {
              initialValue: false,
              messageType: "std_msgs/msg/Int32MultiArray",
              offPayload: "{data: [13, 0]}",
              onPayload: "{data: [13, 1]}",
              topic: "/ui/ros_toggle",
            },
          },
        ),
        { type: "toggle", nextState: "on" },
      ),
    ).toEqual({
      type: "topic-publish",
      widgetId: "digital-output",
      widgetKind: "toggle",
      topic: "/ui/ros_toggle",
      messageType: "std_msgs/msg/Int32MultiArray",
      nextState: "on",
      payload: "{data: [13, 1]}",
      payloadText: "{data: [13, 1]}",
    });
  });

  it("refuses to publish a toggle whose declared type has no authored payload", () => {
    const seededGripper = {
      id: "drive-gripper",
      kind: "toggle",
      title: "Gripper",
      layout: { x: 0, y: 0, width: 130, height: 130 },
      settings: {
        initialValue: false,
        messageType: "std_msgs/msg/Float64MultiArray",
        offLabel: "Open",
        onLabel: "Closed",
        topic: "/gripper_controller/commands",
      },
    } as WidgetConfig;

    expect(createWidgetActionIntent(seededGripper, { type: "toggle", nextState: "on" })).toEqual({
      type: "unsupported",
      widgetId: "drive-gripper",
      widgetKind: "toggle",
      eventType: "toggle",
      reason:
        'Toggle "drive-gripper" has no onPayload configured for std_msgs/msg/Float64MultiArray on /gripper_controller/commands, so there is nothing to publish.',
    });
  });

  it("still publishes contract-default booleans for a Bool toggle without authored payloads", () => {
    const boolToggle = {
      id: "servo-enable",
      kind: "toggle",
      title: "Servoing",
      layout: { x: 0, y: 0, width: 130, height: 130 },
      settings: {
        initialValue: false,
        messageType: "std_msgs/msg/Bool",
        topic: "/ui/visual_servoing/on",
      },
    } as WidgetConfig;

    expect(createWidgetActionIntent(boolToggle, { type: "toggle", nextState: "on" })).toMatchObject({
      type: "topic-publish",
      topic: "/ui/visual_servoing/on",
      messageType: "std_msgs/msg/Bool",
      payload: true,
    });
  });

  it("keeps generic toggle state intents when no output topic is configured", () => {
    expect(
      createWidgetActionIntent(
        createWidgetConfigFromDefinition(
          createDefaultWidgetRegistry().get("toggle") as WidgetDefinition,
          "local-toggle",
          {
            settings: {
              initialValue: false,
              offPayload: 0,
              onPayload: 1,
            },
          },
        ),
        { type: "toggle", nextState: "off" },
      ),
    ).toEqual({
      type: "toggle-state",
      widgetId: "local-toggle",
      widgetKind: "toggle",
      nextState: "off",
      value: false,
      payload: 0,
    });
  });

  it("creates scalar, vector, and gesture value-change intents for input widgets", () => {
    expect(
      createWidgetActionIntent(
        createWidgetConfigFromDefinition(createDefaultWidgetRegistry().get("slider") as WidgetDefinition, "speed", {
          settings: { max: 2, min: 0 },
        }),
        { type: "set-value", value: 1.5 },
      ),
    ).toEqual({
      type: "value-change",
      widgetId: "speed",
      widgetKind: "slider",
      value: 1.5,
    });

    expect(
      createWidgetActionIntent(
        createWidgetConfigFromDefinition(createDefaultWidgetRegistry().get("joystick") as WidgetDefinition, "teleop", {
          settings: { binding: "rot" },
        }),
        { type: "set-vector", value: { x: 0.5, y: -0.25 } },
      ),
    ).toEqual({
      type: "value-change",
      widgetId: "teleop",
      widgetKind: "joystick",
      value: { x: 0.5, y: -0.25 },
      binding: "rot",
      modeId: "rotation",
      publishRateHz: 30,
      runtimeBinding: {
        adapter: "teleop",
        target: "rotation",
      },
      zeroOnRelease: true,
    });

    expect(
      createWidgetActionIntent(
        createWidgetConfigFromDefinition(
          createDefaultWidgetRegistry().get("gesture-pad") as WidgetDefinition,
          "throw-gesture",
          {
            settings: {
              command: "petanque.throw.preview",
              messageType: "std_msgs/msg/String",
              topic: "/petanque/throw/gesture",
            },
          },
        ),
        { type: "set-gesture", value: { angleDegrees: 42, power: 0.7 } },
      ),
    ).toEqual({
      type: "value-change",
      widgetId: "throw-gesture",
      widgetKind: "gesture-pad",
      value: { angleDegrees: 42, power: 0.7 },
      binding: "petanque.throw.preview",
      messageType: "std_msgs/msg/String",
      topic: "/petanque/throw/gesture",
    });
  });

  it("returns explicit unsupported intents for non-action widgets", () => {
    expect(
      createWidgetActionIntent(
        createWidgetConfigFromDefinition(createDefaultWidgetRegistry().get("camera") as WidgetDefinition, "camera"),
        { type: "press" },
      ),
    ).toEqual({
      type: "unsupported",
      widgetId: "camera",
      widgetKind: "camera",
      eventType: "press",
      reason: 'Widget kind "camera" does not produce runtime actions.',
    });
  });
});

function createTestWidgetDefinition(kind: WidgetDefinition["kind"], displayName: string): WidgetDefinition {
  return {
    kind,
    displayName,
    maturity: "ready",
    availability: {
      editor: true,
      runtime: true,
    },
    category: "unknown",
    defaultLayout: {
      height: 120,
      minHeight: 80,
      minWidth: 120,
      width: 220,
    },
    defaultSettings: {},
    defaultTitle: displayName,
    description: `${displayName} test definition`,
    editor: {
      movable: true,
      resizable: true,
      settings: true,
      styleFields: [],
    },
    runtimeRequirements: ["none"],
  };
}

function createTopicMessage(receivedAt: string, value: unknown): TopicMessage {
  return {
    receivedAt,
    topic: "/debug/topic",
    value,
  };
}

function createInMemoryConfigurationFetcher(): typeof fetch {
  const configurations = new Map<string, ConfigurationBundle>();

  return async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const configId = decodeURIComponent(url.split("/api/v1/configurations/")[1] ?? "");

    if (init.method === "PUT") {
      const bundle = JSON.parse(String(init.body)) as ConfigurationBundle;
      configurations.set(configId, bundle);
      return jsonResponse(bundle);
    }

    if (configId) {
      const bundle = configurations.get(configId);
      if (!bundle) {
        return jsonResponse({ detail: "configuration not found" }, 404);
      }
      return jsonResponse(bundle);
    }

    return jsonResponse({ configuration_ids: [...configurations.keys()].sort() });
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("a toggle straight from the palette", () => {
  // Robin, 2026-09-21: a gripper toggle built in the Builder did not publish. It arrived holding a bare
  // JS boolean and no topic, so it had to be assembled from four fields an author had to know.
  it("publishes the gripper command without anything being configured", () => {
    const definition = DEFAULT_WIDGET_DEFINITIONS.find((candidate) => candidate.kind === "toggle");
    const widget = {
      id: "gripper",
      kind: "toggle",
      title: definition?.defaultTitle ?? "",
      layout: { x: 0, y: 0, ...definition?.defaultLayout },
      settings: definition?.defaultSettings,
    } as WidgetConfig;

    expect(createWidgetActionIntent(widget, { type: "toggle", nextState: "on" })).toMatchObject({
      type: "topic-publish",
      topic: "/gripper_controller/commands",
      messageType: "std_msgs/msg/Float64MultiArray",
    });
  });

  it("gives each arm its own travel", () => {
    expect(gripperToggleSettings("Explorer").onPayload).toBe("{data: [0.2]}");
    expect(gripperToggleSettings("Explorer").offPayload).toBe("{data: [1.1]}");
    expect(gripperToggleSettings("Kinova").onPayload).toBe("{data: [0]}");
    expect(gripperToggleSettings("Kinova").offPayload).toBe("{data: [0.8]}");
    // An unknown or absent robot falls back to the arm this stack was built for.
    expect(gripperToggleSettings(undefined).offPayload).toBe("{data: [1.1]}");
  });
});

describe("authoring a shipped screen", () => {
  // Susana, 2026-09-22: everything the runtime does today must be reproducible in the Builder. The
  // renderers honoured about twenty settings the inspector never showed -- hold-to-run, confirm-to-move,
  // the gripper's commanded-state readout, the operator speed segments -- so a shipped screen could be
  // read but not rebuilt.
  it("offers an editor field for every setting the shipped operator apps use", () => {
    const seeds = [explorerManagerSeed, kinovaManagerSeed, explorerCameraTestSeed, kinovaCameraTestSeed] as unknown as {
      applications: ApplicationConfig[];
    }[];
    // Settings the runtime derives rather than things an author sets. `axes` used to be here too:
    // the seeds carried a block that normalization replaced before anything read it, so it was
    // removed rather than exempted.
    const NOT_AUTHORED = new Set(["binding", "mode_id"]);
    const missing = new Set<string>();

    for (const bundle of seeds) {
      for (const application of bundle.applications) {
        for (const screenConfig of application.screens) {
          for (const widget of screenConfig.widgets) {
            const contract = getWidgetSettingsContract(widget.kind);
            if (!contract) continue;
            const fields = new Set(contract.fields.map((field) => field.key));
            for (const key of Object.keys(widget.settings ?? {})) {
              if (!fields.has(key) && !NOT_AUTHORED.has(key)) {
                missing.add(`${widget.kind}.${key}`);
              }
            }
          }
        }
      }
    }

    expect([...missing].sort()).toEqual([]);
  });
});

describe("what the Builder says a pad moves", () => {
  // The seeds name their axes in runtime_binding and omit the legacy `binding` string, so every
  // seeded joystick normalized to translation defaults: the Builder showed X+/X- in sage for the
  // rotation pad while the runtime drew RX+/RX- in clay. Same widget, two answers.
  it("reads the rotation pad as rotation, from what it actually drives", () => {
    const seeded = {
      mode_id: "both",
      runtime_binding: {
        adapter: "teleop",
        target: "rotation",
        value_mapping: { mode: 0, target_topic: "/joystick_cartesian_command" },
        axis_mapping: { x: { component: "angular_x" }, y: { component: "angular_y" } },
      },
    };

    const normalized = normalizeWidgetSettings("joystick", seeded);

    expect(normalized.success).toBe(true);
    if (!normalized.success) return;
    const hints = normalized.settings.axis_hints as { x: { positive_label: string; semantic: string } };
    expect(hints.x.positive_label).toBe("RX+");
    expect(hints.x.semantic).toBe("rotation");
  });

  it("leaves a translation pad alone", () => {
    const normalized = normalizeWidgetSettings("joystick", {
      runtime_binding: {
        adapter: "teleop",
        axis_mapping: { x: { component: "linear_x" }, y: { component: "linear_y" } },
      },
    });

    expect(normalized.success).toBe(true);
    if (!normalized.success) return;
    const hints = normalized.settings.axis_hints as { x: { positive_label: string } };
    expect(hints.x.positive_label).toBe("X+");
  });
});
