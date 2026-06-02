import type { ConfigurationBundle, ScreenConfig } from "@bloom/api-client";
import { describe, expect, it } from "vitest";

import { replaceScreenInConfigurationBundle } from "./configuration-editor";

describe("replaceScreenInConfigurationBundle", () => {
  it("replaces one screen while preserving the rest of the bundle", () => {
    const replacementScreen: ScreenConfig = {
      ...createScreen("main"),
      title: "Updated main",
      widgets: [
        {
          id: "button",
          kind: "button",
          title: "Start",
          layout: { x: 16, y: 24, width: 120, height: 80 },
          settings: {},
        },
      ],
    };

    const updatedBundle = replaceScreenInConfigurationBundle(createBundle(), "sandbox", replacementScreen);

    expect(updatedBundle.applications[0]?.screens[0]).toEqual(replacementScreen);
    expect(updatedBundle.applications[0]?.screens[1]).toEqual(createScreen("diagnostics"));
    expect(updatedBundle.metadata).toEqual(createBundle().metadata);
  });

  it("fails explicitly when the application is missing", () => {
    expect(() => replaceScreenInConfigurationBundle(createBundle(), "missing", createScreen("main"))).toThrow(
      'Application "missing" was not found in the selected configuration.',
    );
  });

  it("fails explicitly when the screen is missing", () => {
    expect(() => replaceScreenInConfigurationBundle(createBundle(), "sandbox", createScreen("missing"))).toThrow(
      'Screen "missing" was not found in application "sandbox".',
    );
  });
});

function createBundle(): ConfigurationBundle {
  return {
    metadata: {
      schema_version: 1,
      exported_at: "2026-06-01T14:00:00Z",
      source: "dashboard-test",
    },
    applications: [
      {
        id: "sandbox",
        name: "Sandbox",
        description: "Sandbox operator interface",
        screens: [createScreen("main"), createScreen("diagnostics")],
      },
    ],
  };
}

function createScreen(id: string): ScreenConfig {
  return {
    id,
    title: id === "main" ? "Main" : "Diagnostics",
    canvas: { preset_id: "hd", runtime_mode: "fit" },
    widgets: [],
  };
}
