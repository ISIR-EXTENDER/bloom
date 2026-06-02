import type { ConfigurationBundle, ScreenConfig } from "@bloom/api-client";
import { describe, expect, it } from "vitest";
import sharedConfigurationBundle from "../../../../tests/fixtures/configuration-bundle.json";

import {
  createDefaultWidgetRegistry,
  createWidgetConfigFromDefinition,
  createWidgetRegistry,
  DEFAULT_WIDGET_DEFINITIONS,
  LEGACY_WIDGET_KIND_MAPPINGS,
  listWidgetDefinitionsByCategory,
  renderScreenDescriptors,
  renderWidgetDescriptor,
  resolveLegacyWidgetKind,
  toBloomWidgetKind,
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
      runtimeRequirements: ["teleop-adapter"],
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
      settings: {
        direction: "vertical",
        max: 3,
        min: 0,
        step: 0.01,
      },
    });
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

  it("keeps app-specific widgets out of Bloom core", () => {
    expect(resolveLegacyWidgetKind("throw-draw")).toMatchObject({
      bloomKind: "unknown",
      compatibility: "app-specific",
    });
    expect(resolveLegacyWidgetKind("drink")).toMatchObject({
      bloomKind: "command-button",
      compatibility: "app-specific",
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
    runtimeRequirements: ["none"],
  };
}
