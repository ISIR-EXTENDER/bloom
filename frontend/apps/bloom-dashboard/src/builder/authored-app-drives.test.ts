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
