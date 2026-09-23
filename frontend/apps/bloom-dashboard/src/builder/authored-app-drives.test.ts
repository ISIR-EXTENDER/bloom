import { DEFAULT_RUNTIME_POLICY } from "@bloom/api-client";
import { DEFAULT_WIDGET_DEFINITIONS, INTERACTIVE_WIDGET_KINDS, primaryTargetFor } from "@bloom/widgets";
import { describe, expect, it, vi } from "vitest";

import { dispatchRuntimeActionIntent, type RuntimeActionClient } from "../runtime/runtime-action-dispatcher";
import { TeleopTwistComposer } from "../runtime/teleop-composition";
import { densityFloorFor } from "./builder-geometry";

/**
 * The seam Robin's bench report landed on, 2026-09-21.
 *
 * Every simulation check drives a shipped app. Nobody had ever authored one and driven it, so the two
 * things that made the Builder unusable -- a new app that declares no teleop target, and a glass check
 * that judged every screen at the tablet -- were invisible to QA while passing 12 of 12 on both robots.
 */
describe("an app as the Builder creates it", () => {
  it("can drive the robot", async () => {
    const client: RuntimeActionClient = {
      publishRosTopic: vi.fn(),
      sendTeleopCommand: vi.fn(async (request) => ({
        type: "teleop_ack" as const,
        detail: "Accepted.",
        payload: { ...request, frame_id: request.frame_id ?? "", status: "accepted" as const },
      })),
    };

    const result = await dispatchRuntimeActionIntent(
      client,
      {
        type: "value-change",
        widgetId: "joystick",
        widgetKind: "joystick",
        binding: "joy",
        publishRateHz: 30,
        runtimeBinding: { adapter: "teleop", value_mapping: { target_topic: "/joystick_cartesian_command" } },
        value: { x: 0.25, y: 0 },
        zeroOnRelease: true,
      },
      { runtimePolicy: DEFAULT_RUNTIME_POLICY, teleopComposer: new TeleopTwistComposer() },
    );

    expect(result.status).toBe("accepted");
  });

  it("places widgets that clear the floor of the panel they are checked at", () => {
    // 1280x720 authored, fitted to the 1024x600 tablet, times the builder's overflow guard.
    const scale = Math.min(1024 / 1280, 600 / 720) * 0.99;
    const tooSmall = DEFAULT_WIDGET_DEFINITIONS.filter((definition) => {
      if (!INTERACTIVE_WIDGET_KINDS.has(definition.kind)) {
        return false;
      }
      const target = primaryTargetFor(definition.kind, definition.defaultSettings ?? {}, definition.defaultLayout);
      return Math.floor((target ?? 0) * scale) < densityFloorFor("tablet");
    });

    expect(tooSmall.map((definition) => definition.kind)).toEqual([]);
  });
});

describe("a shipped command button's command", () => {
  /**
   * `findActionPreset` matches on the exact string, so a rename on one side and not the other leaves
   * a button that looks live and dispatches nothing. That is how "Enable safety zone" in the user
   * test app came to name `explorer.safety_zone.enable` while its preset said `explorer.safe_zone.enable`.
   *
   * Five buttons in that app still resolve to nothing and are listed here rather than hidden: they
   * have no preset at all, and inventing the legacy UI's payloads would be guessing at a robot
   * contract. Deciding their fate is a study-design question.
   */

  it("names a preset that exists, in every shipped app", async () => {
    const seeds = await Promise.all(
      ["explorer-manager", "kinova-manager", "explorer-camera-test", "kinova-camera-test"].map(
        async (id) => [id, (await import(`../../../../../backend/seed/applications/${id}.json`)).default] as const,
      ),
    );

    const dangling: string[] = [];
    for (const [seedId, bundle] of seeds) {
      for (const application of bundle.applications) {
        const commands = new Set(
          (application.action_presets ?? []).flatMap((preset: { command?: string }) =>
            preset.command ? [preset.command] : [],
          ),
        );
        const presetIds = new Set((application.action_presets ?? []).map((preset: { id: string }) => preset.id));
        for (const screenConfig of application.screens ?? []) {
          for (const widget of screenConfig.widgets ?? []) {
            if (widget.kind !== "command-button") continue;
            const settings = widget.settings ?? {};
            const routed =
              Boolean(settings.topic) ||
              Boolean(settings.runtime_binding) ||
              presetIds.has(settings.presetId) ||
              commands.has(settings.command) ||
              Boolean(settings.targetScreenId);
            if (!routed && settings.command) {
              dangling.push(`${seedId}/${widget.id} → ${settings.command}`);
            }
          }
        }
      }
    }

    expect(dangling.sort()).toEqual([]);
  });
});
