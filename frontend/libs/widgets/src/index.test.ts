import type { ConfigurationBundle, ScreenConfig } from "@bloom/api-client";
import { describe, expect, it } from "vitest";
import sharedConfigurationBundle from "../../../../tests/fixtures/configuration-bundle.json";

import {
  createWidgetRegistry,
  LEGACY_WIDGET_KIND_MAPPINGS,
  renderScreenDescriptors,
  renderWidgetDescriptor,
  resolveLegacyWidgetKind,
  toBloomWidgetKind,
} from "./index";

const sampleBundle = sharedConfigurationBundle as unknown as ConfigurationBundle;
const sampleScreen = sampleBundle.applications[0]?.screens[0] as ScreenConfig;
const sampleWidget = sampleScreen.widgets[0];

describe("widget registry foundation", () => {
  it("creates a registry from widget definitions", () => {
    const registry = createWidgetRegistry([{ kind: "command-button", displayName: "Command button" }]);

    expect(registry.get("command-button")).toEqual({
      kind: "command-button",
      displayName: "Command button",
    });
  });

  it("rejects duplicate widget definitions", () => {
    expect(() =>
      createWidgetRegistry([
        { kind: "toggle", displayName: "Toggle A" },
        { kind: "toggle", displayName: "Toggle B" },
      ]),
    ).toThrow('Duplicate widget definition for kind "toggle".');
  });

  it("resolves registered widgets from the shared configuration fixture", () => {
    const registry = createWidgetRegistry([{ kind: "command-button", displayName: "Command button" }]);

    const descriptor = renderWidgetDescriptor(sampleWidget, registry, { screenId: sampleScreen.id });

    expect(descriptor).toMatchObject({
      status: "resolved",
      widget: {
        id: "toggle",
        kind: "command-button",
      },
      definition: {
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
    const registry = createWidgetRegistry([{ kind: "command-button", displayName: "Command button" }]);

    expect(renderScreenDescriptors(sampleScreen, registry)).toHaveLength(1);
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
});
