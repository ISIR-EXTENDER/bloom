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

const modeIntent = (mode: string): WidgetActionIntent => ({
  type: "topic-publish",
  topic: "/mode_request",
  messageType: "std_msgs/msg/String",
  payload: { data: mode },
  widgetId: `drive-${mode}`,
  widgetKind: "command-button",
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
    ["a 500", apiError(500, "Internal Server Error"), "unknown"],
    ["a 502 publish failure", apiError(502, "Publisher crashed."), "unknown"],
    ["a 503 publish failure", apiError(503, "rosidl_runtime_py is required to publish ROS messages"), "unknown"],
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
