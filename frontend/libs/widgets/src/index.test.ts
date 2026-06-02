import { type ConfigurationBundle, createBloomApiClient, type ScreenConfig } from "@bloom/api-client";
import { describe, expect, it } from "vitest";
import legacyPetanqueApplication from "../../../../backend/tests/fixtures/legacy/application-play-petanque.json";
import legacyConfigurationsScreen from "../../../../backend/tests/fixtures/legacy/configurations.json";
import legacySandboxScreen from "../../../../backend/tests/fixtures/legacy/sandbox_control.json";
import sharedConfigurationBundle from "../../../../tests/fixtures/configuration-bundle.json";

import {
  addWidgetToScreen,
  appendTopicEchoMessage,
  appendTopicPlotSample,
  buildRosMessageToggleCliExample,
  createAppExtensionRegistry,
  createDefaultWidgetRegistry,
  createWidgetActionIntent,
  createWidgetConfigFromDefinition,
  createWidgetRegistry,
  DEFAULT_WIDGET_DEFINITIONS,
  duplicateWidgetInScreen,
  findMatchingRosMessageTogglePreset,
  formatTopicEchoValue,
  getDefaultRosMessageTogglePayloads,
  LEGACY_WIDGET_KIND_MAPPINGS,
  legacyCanvasScreensToApplicationConfig,
  legacyCanvasScreensToConfigurationBundle,
  legacyCanvasScreenToConfig,
  legacyCanvasWidgetToConfig,
  legacyRectToLayout,
  listWidgetDefinitionsByCategory,
  moveWidget,
  normalizeWidgetSettings,
  ROS_MESSAGE_TOGGLE_PRESETS,
  removeWidgetFromScreen,
  renderScreenDescriptors,
  renderWidgetDescriptor,
  resizeWidget,
  resolveCanvasArtboardSize,
  resolveCanvasFitScale,
  resolveCanvasPresetSize,
  resolveFieldPath,
  resolveLegacyWidgetKind,
  resolveWidgetAppExtension,
  snapLayoutValue,
  type TopicMessage,
  type TopicPlotSample,
  toBloomWidgetKind,
  updateWidgetSettings,
  updateWidgetTitle,
  validateWidgetSettings,
  WIDGET_SETTINGS_CONTRACTS,
  type WidgetDefinition,
} from "./index";

const sampleBundle = sharedConfigurationBundle as unknown as ConfigurationBundle;
const sampleScreen = sampleBundle.applications[0]?.screens[0] as ScreenConfig;
const sampleWidget = sampleScreen.widgets[0];

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
    expect(DEFAULT_WIDGET_DEFINITIONS.map((definition) => definition.kind).sort()).toEqual([
      "button",
      "camera",
      "command-button",
      "gauge",
      "joystick",
      "label",
      "plot",
      "slider",
      "toggle",
      "topic-echo",
      "topic-plot",
      "unknown",
    ]);
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
        height: 220,
        minHeight: 160,
        minWidth: 160,
        width: 220,
      },
      defaultSettings: {
        binding: "joy",
        deadzone: 0.1,
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
    const commandWidgets = listWidgetDefinitionsByCategory(createDefaultWidgetRegistry(), "command");

    expect(commandWidgets.map((definition) => definition.kind).sort()).toEqual(["button", "command-button"]);
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
        height: 220,
      },
      settings: {
        direction: "vertical",
        max: 3,
        min: 0,
        step: 0.01,
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
      "gauge",
      "joystick",
      "label",
      "plot",
      "slider",
      "toggle",
      "topic-echo",
      "topic-plot",
      "unknown",
    ]);
  });

  it("normalizes partial settings with widget defaults", () => {
    expect(normalizeWidgetSettings("slider", { max: 3, min: 0 })).toEqual({
      success: true,
      settings: {
        direction: "vertical",
        max: 3,
        min: 0,
        step: 0.01,
      },
    });
  });

  it("reports clear validation errors for invalid settings", () => {
    expect(validateWidgetSettings("slider", { direction: "sideways", max: 0, min: 1, step: 0 })).toEqual({
      success: false,
      errors: [
        {
          field: "direction",
          message: "direction must be one of: horizontal, vertical",
        },
        {
          field: "max",
          message: "max must be greater than min",
        },
      ],
    });
  });

  it("validates structured joystick labels", () => {
    expect(
      validateWidgetSettings("joystick", {
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

  it("validates topic plot debug settings", () => {
    expect(
      normalizeWidgetSettings("topic-plot", {
        fieldPath: "velocity.x",
        messageType: "geometry_msgs/msg/Twist",
        topic: "/sandbox_controller/velocity_command",
        unit: "m/s",
      }),
    ).toEqual({
      success: true,
      settings: {
        fieldPath: "velocity.x",
        historySeconds: 30,
        maxSamples: 500,
        messageType: "geometry_msgs/msg/Twist",
        topic: "/sandbox_controller/velocity_command",
        unit: "m/s",
      },
    });

    expect(
      validateWidgetSettings("topic-plot", {
        fieldPath: "",
        historySeconds: 0,
        maxSamples: 10,
        messageType: "",
        topic: "",
        unit: "",
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
        topic: "/joint_states",
      },
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

  it("keeps ROS message toggle presets available for non-web users", () => {
    expect(ROS_MESSAGE_TOGGLE_PRESETS.map((preset) => preset.id)).toContain("digital-output-array");
    expect(getDefaultRosMessageTogglePayloads("std_msgs/msg/Int32MultiArray")).toEqual({
      onPayload: "{data: [13, 1]}",
      offPayload: "{data: [13, 0]}",
    });
  });

  it("builds ROS CLI-style previews for typed toggle payloads", () => {
    expect(
      buildRosMessageToggleCliExample(
        {
          topic: "/petanque_state_machine/change_state",
          messageType: "std_msgs/msg/String",
          onPayload: "{data: 'activate_throw'}",
          offPayload: "{data: 'teleop'}",
        },
        "on",
      ),
    ).toBe("ros2 topic pub -1 /petanque_state_machine/change_state std_msgs/msg/String \"{data: 'activate_throw'}\"");
  });

  it("matches ROS message toggle presets from settings", () => {
    expect(
      findMatchingRosMessageTogglePreset({
        messageType: "std_msgs/msg/String",
        onPayload: "{data: 'activate_throw'}",
        offPayload: "{data: 'teleop'}",
      })?.id,
    ).toBe("state-machine");
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
    expect(toBloomWidgetKind("joystick")).toBe("joystick");
    expect(toBloomWidgetKind("slider")).toBe("slider");
    expect(toBloomWidgetKind("button")).toBe("command-button");
    expect(toBloomWidgetKind("text")).toBe("label");
    expect(toBloomWidgetKind("stream-display")).toBe("camera");
    expect(toBloomWidgetKind("curves")).toBe("plot");
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
  });

  it("keeps reusable complex widgets out of Bloom core until generic models exist", () => {
    expect(resolveLegacyWidgetKind("throw-draw")).toMatchObject({
      bloomKind: "unknown",
      compatibility: "adapter-required",
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
      "gripper-control",
      "magnet-control",
      "toggle-publisher",
      "ros-message-toggle",
      "stream-display",
      "throw-draw",
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
    expect((navigation?.settings.items as Array<{ targetScreenId: string }>)[0]?.targetScreenId).toBe(
      "default_control",
    );
  });

  it("converts real legacy screens into a Bloom configuration bundle", () => {
    const bundle = legacyCanvasScreensToConfigurationBundle([legacyConfigurationsScreen, legacySandboxScreen], {
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
    const bundle = legacyCanvasScreensToConfigurationBundle([legacyConfigurationsScreen, legacySandboxScreen], {
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

describe("app widget extension points", () => {
  it("creates app extension registries with unique ids and legacy widget ownership", () => {
    expect(() =>
      createAppExtensionRegistry([
        {
          id: "petanque",
          label: "Petanque",
          legacyWidgetKinds: ["throw-draw"],
        },
        {
          id: "petanque-duplicate",
          label: "Petanque duplicate",
          legacyWidgetKinds: ["throw-draw"],
        },
      ]),
    ).toThrow('Legacy widget kind "throw-draw" is already owned by app extension "petanque".');
  });

  it("resolves explicitly app-owned widgets through registered extensions", () => {
    const registry = createAppExtensionRegistry([
      {
        id: "petanque",
        label: "Petanque",
        legacyWidgetKinds: ["drink", "throw-draw"],
        rendererKey: "petanque.widgets",
        runtimeAdapterKey: "petanque.runtime",
      },
    ]);
    const widget = legacyCanvasWidgetToConfig({
      id: "throw",
      kind: "throw-draw",
      label: "Throw draw",
      appExtensionId: "petanque",
    });

    expect(resolveWidgetAppExtension(widget, registry)).toMatchObject({
      status: "resolved",
      legacyKind: "throw-draw",
      extension: {
        id: "petanque",
        rendererKey: "petanque.widgets",
        runtimeAdapterKey: "petanque.runtime",
      },
    });
  });

  it("uses explicit app extension ids instead of assuming legacy Petanque widgets are app-only", () => {
    const registry = createAppExtensionRegistry();
    const explicitAppWidget = legacyCanvasWidgetToConfig({
      id: "drink",
      kind: "drink",
      label: "Drink",
      appExtensionId: "petanque",
    });
    const genericWidget = legacyCanvasWidgetToConfig({
      id: "throw",
      kind: "throw-draw",
      label: "Gesture draw",
    });

    expect(resolveWidgetAppExtension(explicitAppWidget, registry)).toEqual({
      status: "missing",
      legacyKind: "drink",
      reason: 'No app extension registered for id "petanque".',
    });
    expect(resolveWidgetAppExtension(genericWidget, registry)).toEqual({
      status: "none",
    });
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

  it("moves and resizes widgets with optional grid snapping", () => {
    const movedScreen = moveWidget(sampleScreen, "toggle", { x: 13, y: 19 }, { snapToGrid: true });
    const resizedScreen = resizeWidget(movedScreen, "toggle", { width: 133, height: 77 }, { snapToGrid: true });

    expect(resizedScreen.widgets[0]?.layout).toEqual({
      x: 16,
      y: 16,
      width: 136,
      height: 80,
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

  it("creates scalar and vector value-change intents for input widgets", () => {
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
