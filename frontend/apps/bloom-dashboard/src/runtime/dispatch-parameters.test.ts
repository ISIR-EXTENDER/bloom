import { BloomApiError, type RosParameterSetRequest, type RuntimeAdapterPolicy } from "@bloom/api-client";
import type { WidgetActionIntent } from "@bloom/widgets";
import { describe, expect, it } from "vitest";
import { createParameterRequest, dispatchParameterRequest } from "./dispatch-parameters";
import type { RuntimeActionClient } from "./runtime-protocol";

const intent = { type: "slider", widgetId: "gain", widgetKind: "slider", value: 3 } as unknown as WidgetActionIntent;
const request: RosParameterSetRequest = { node: "/cartesian_manager", name: "shapers.snake.gain", value: 3 };
const policy = (allowed_parameters?: string[]) => ({ allowed_parameters }) as unknown as RuntimeAdapterPolicy;

/** A backend that keeps the parameters it was asked to set, scoped to the app that asked. */
function manager(answer: { status: "set" | "rejected" | "unavailable"; detail?: string } | Error) {
  const received: unknown[] = [];
  const client = {
    setRosParameter: async (sent: unknown) => {
      received.push(sent);
      if (answer instanceof Error) throw answer;
      return answer;
    },
  } as unknown as RuntimeActionClient;
  return { client, received };
}

describe("a slider bound to a manager parameter", () => {
  it("names the node and parameter, taking a number or a boolean and nothing else", () => {
    const binding = {
      adapter: "parameter",
      value_mapping: { node: "/cartesian_manager", parameter: "shapers.snake.gain" },
    };
    expect(createParameterRequest(binding, 2.5)).toEqual({
      node: "/cartesian_manager",
      name: "shapers.snake.gain",
      value: 2.5,
    });
    expect(createParameterRequest(binding, true)).toEqual({
      node: "/cartesian_manager",
      name: "shapers.snake.gain",
      value: true,
    });
    expect(createParameterRequest(binding, "3")).toBeNull();
    expect(createParameterRequest(binding, Number.NaN)).toBeNull();
    expect(createParameterRequest({ ...binding, value_mapping: { node: "/cartesian_manager" } }, 1)).toBeNull();
    expect(createParameterRequest({ adapter: "topic", value_mapping: binding.value_mapping }, 1)).toBeNull();
  });
});

describe("setting a manager parameter", () => {
  it("is blocked unless the app's policy names the parameter; an empty list allows none", async () => {
    const { client, received } = manager({ status: "set" });
    const blocked = await dispatchParameterRequest(client, intent, request, { runtimePolicy: policy([]) });
    expect(blocked).toMatchObject({ status: "blocked", detail: expect.stringContaining("shapers.snake.gain") });
    const other = await dispatchParameterRequest(client, intent, request, {
      runtimePolicy: policy(["/cartesian_manager:mode"]),
    });
    expect(other.status).toBe("blocked");
    // A wildcard is the whole allowlist, not a pattern within it.
    await expect(
      dispatchParameterRequest(client, intent, request, { runtimePolicy: policy(["/cartesian_manager:shapers.*"]) }),
    ).resolves.toMatchObject({ status: "blocked" });
    expect(received).toEqual([]);
    await expect(
      dispatchParameterRequest(client, intent, request, { runtimePolicy: policy(["*"]) }),
    ).resolves.toMatchObject({
      status: "published",
    });
  });

  it("reaches the manager with the app's scope and reports the backend's own status", async () => {
    const { client, received } = manager({ status: "set", detail: "applied" });
    const result = await dispatchParameterRequest(client, intent, request, {
      appId: "explorer",
      configId: "lab",
      runtimePolicy: policy(["/cartesian_manager:shapers.snake.gain"]),
    });
    expect(result).toEqual({ intent, status: "published", detail: "applied" });
    expect(received).toEqual([{ ...request, app_id: "explorer", config_id: "lab" }]);

    const refused = manager({ status: "rejected", detail: "out of bounds" });
    await expect(dispatchParameterRequest(refused.client, intent, request, {})).resolves.toMatchObject({
      status: "rejected",
      detail: "out of bounds",
    });
  });

  it("says when no client can carry it, and classifies a failed call", async () => {
    await expect(dispatchParameterRequest({} as RuntimeActionClient, intent, request, {})).resolves.toMatchObject({
      status: "unsupported",
    });
    const busy = manager(new BloomApiError("Too many", 429, JSON.stringify({ detail: "Slow down." })));
    await expect(dispatchParameterRequest(busy.client, intent, request, {})).resolves.toMatchObject({
      status: "transient",
      detail: "Too many Slow down.",
    });
    const down = manager(new Error("socket hang up"));
    await expect(dispatchParameterRequest(down.client, intent, request, {})).resolves.toMatchObject({
      status: "unknown",
      detail: "socket hang up",
    });
  });
});
