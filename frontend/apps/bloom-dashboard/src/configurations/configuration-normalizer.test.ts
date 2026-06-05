import type { ConfigurationBundle } from "@bloom/api-client";
import { describe, expect, it } from "vitest";

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
      preset_id: "bloom-default",
      palette: {
        accent: "#d9a441",
        background: "#f7f1e6",
        primary: "#5f7f63",
        surface: "#fffdf7",
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
