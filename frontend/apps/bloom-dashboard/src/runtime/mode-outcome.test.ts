import { BloomApiError } from "@bloom/api-client";
import type { WidgetActionIntent } from "@bloom/widgets";
import { describe, expect, it } from "vitest";
import {
  classifyDispatchError,
  dispatchRuntimeActionIntent,
  type RuntimeActionClient,
  type RuntimeActionDispatchResult,
  toWidgetActionStatus,
} from "./runtime-action-dispatcher";
import {
  applyRuntimeModeOutcome,
  applyRuntimeStopLatch,
  createDefaultRuntimeModeState,
  createRuntimeControlStateByWidgetId,
  UNKNOWN_REQUESTED_MODE,
} from "./runtimeModeState";

// ADR 0141: an accepted mode request sets the mode, one without a reply makes it unknown, a superseded one changes nothing.

const modeIntent = (mode: string): WidgetActionIntent => ({
  type: "topic-publish",
  topic: "/mode_request",
  messageType: "std_msgs/msg/String",
  payload: { data: mode },
  widgetId: `drive-${mode}`,
  widgetKind: "command-button",
});

const modeButton = (id: string, mode: string, extra: Record<string, unknown> = {}) => ({
  id,
  kind: "command-button" as const,
  title: id,
  layout: { x: 0, y: 0, width: 10, height: 10 },
  settings: { topic: "/mode_request", messageType: "std_msgs/msg/String", payload: { data: mode }, ...extra },
});

const driveScreen = {
  id: "drive",
  title: "Drive",
  widgets: [
    modeButton("drive-mode-both", "geometric/both"),
    modeButton("drive-mode-jaco", "geometric/jaco"),
    modeButton("positions-home", "behaviour/joint_target/home", { confirm_press: true }),
  ],
} as never;

const jacoRequested = () => ({ ...createDefaultRuntimeModeState(), requestedMode: "geometric/jaco" });

describe("a mode request's outcome", () => {
  it("sets the mode when accepted", () => {
    const next = applyRuntimeModeOutcome(createDefaultRuntimeModeState(), modeIntent("geometric/jaco"), "accepted");

    expect(next.requestedMode).toBe("geometric/jaco");
    expect(next.unconfirmedMode).toBeNull();
  });

  it("makes the mode unknown, not the previous one, when no reply came", () => {
    const next = applyRuntimeModeOutcome(jacoRequested(), modeIntent("geometric/both"), "unknown");

    expect(next.requestedMode).toBe(UNKNOWN_REQUESTED_MODE);
    expect(next.unconfirmedMode).toBe("geometric/both");
    expect(createRuntimeControlStateByWidgetId(driveScreen, next)).toEqual({
      "drive-mode-both": { selection: "unconfirmed" },
      "drive-mode-jaco": { selection: "unselected" },
      "positions-home": { selection: "unselected" },
    });
  });

  it("makes the mode unknown when a Go home times out", () => {
    const next = applyRuntimeModeOutcome(jacoRequested(), modeIntent("behaviour/joint_target/home"), "unknown");

    expect(next.requestedMode).toBe(UNKNOWN_REQUESTED_MODE);
    expect(createRuntimeControlStateByWidgetId(driveScreen, next)["positions-home"]).toEqual({
      selection: "unconfirmed",
    });
  });

  it.each(["superseded", "refused", "transient"] as const)("leaves the mode as it was when %s", (outcome) => {
    const before = jacoRequested();

    expect(applyRuntimeModeOutcome(before, modeIntent("geometric/both"), outcome)).toBe(before);
  });

  it("leaves the mode alone when a request that is not a mode request has no reply", () => {
    const before = jacoRequested();
    const gripper = { ...modeIntent("x"), topic: "/gripper_controller/commands" } as WidgetActionIntent;

    expect(applyRuntimeModeOutcome(before, gripper, "unknown")).toBe(before);
  });

  it("converges once a retry is accepted, and a STOP latch still resets it", () => {
    const unknown = applyRuntimeModeOutcome(jacoRequested(), modeIntent("geometric/both"), "unknown");
    const accepted = applyRuntimeModeOutcome(unknown, modeIntent("geometric/both"), "accepted");
    expect(accepted.requestedMode).toBe("geometric/both");
    expect(accepted.unconfirmedMode).toBeNull();

    const stopped = applyRuntimeStopLatch(unknown, { asserted: true });
    expect(stopped.requestedMode).toBe("geometric/both");
    expect(stopped.unconfirmedMode).toBeNull();
    expect(applyRuntimeStopLatch(unknown, { asserted: false }).requestedMode).toBeNull();
  });
});

describe("a publish error", () => {
  const superseded = () =>
    new BloomApiError(
      "Bloom API request failed with status 409",
      409,
      JSON.stringify({
        detail: { code: "superseded", message: "A newer command for /mode_request was already applied." },
      }),
    );

  const apiError = (status: number, detail: unknown) =>
    new BloomApiError(`Bloom API request failed with status ${status}`, status, JSON.stringify({ detail }));

  it.each([
    ["a 409 superseded", superseded(), "superseded"],
    ["a 429 rate limit", apiError(429, "Too many requests."), "transient"],
    ["a 409 STOP latch", apiError(409, "Runtime stop is engaged."), "failed"],
    [
      "a 409 from a session that does not own control",
      apiError(409, "This runtime session does not own robot control."),
      "failed",
    ],
    ["a 403", apiError(403, "ROS topic is not allowed."), "failed"],
    ["a 422", apiError(422, "Payload does not match."), "failed"],
    ["a 503 publish failure", apiError(503, "rosidl_runtime_py is required to publish ROS messages"), "failed"],
    ["a 503 service that did not answer", apiError(503, "Service /home did not answer within 2.0s."), "unknown"],
    ["a 504", new BloomApiError("504", 504, ""), "unknown"],
    ["a client timeout", new Error("ROS publish on /x timed out after 4 s."), "unknown"],
    ["a network error", new TypeError("Failed to fetch"), "unknown"],
  ])("maps %s to %s", (_name, error, expected) => {
    expect(classifyDispatchError(error).status).toBe(expected);
  });

  it("reaches the control as superseded, never as a refusal", async () => {
    const client = {
      publishRosTopic: async () => {
        throw superseded();
      },
    } as unknown as RuntimeActionClient;
    const result = await dispatchRuntimeActionIntent(client, modeIntent("geometric/both"));

    expect(result.status).toBe("superseded");
    expect(toWidgetActionStatus(result)).toBe("superseded");
  });

  it.each([
    ["published", "accepted"],
    ["accepted", "accepted"],
    ["coalesced", "accepted"],
    ["superseded", "superseded"],
    ["unknown", "unknown"],
    ["transient", "transient"],
    ["failed", "refused"],
    ["blocked", "refused"],
    ["simulated", "refused"],
    ["unsupported", "refused"],
  ] as const)("maps a %s dispatch to %s", (status, expected) => {
    const result = { detail: "", intent: modeIntent("geometric/both"), status } as RuntimeActionDispatchResult;

    expect(toWidgetActionStatus(result)).toBe(expected);
  });
});
