import type { ConfigurationBundle } from "@bloom/api-client";
import { describe, expect, it } from "vitest";

import compactSandboxConfiguration from "../../../../../backend/data/configurations/sandbox.json";
import { normalizeConfigurationBundle } from "./configuration-normalizer";

describe("normalizeConfigurationBundle", () => {
  it("fills builder-safe defaults for compact backend configuration JSON", () => {
    const normalizedBundle = normalizeConfigurationBundle(
      compactSandboxConfiguration as unknown as ConfigurationBundle,
    );
    const screen = normalizedBundle.applications[0]?.screens[0];
    const widget = screen?.widgets[0];

    expect(screen?.canvas).toEqual({ preset_id: "tablet", runtime_mode: "fit" });
    expect(widget?.layout).toEqual({ x: 0, y: 0, width: 240, height: 120 });
    expect(widget?.settings).toMatchObject({
      payloadOn: { data: [13, 1] },
      payloadOff: { data: [13, 0] },
      topic: "/ui/ros_toggle",
    });
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
  });
});
