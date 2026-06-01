import type { ConfigurationBundle, ScreenConfig } from "@bloom/api-client";
import { describe, expect, it } from "vitest";
import sharedConfigurationBundle from "../../../../tests/fixtures/configuration-bundle.json";

import { createWidgetRegistry, renderScreenDescriptors, renderWidgetDescriptor } from "./index";

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
