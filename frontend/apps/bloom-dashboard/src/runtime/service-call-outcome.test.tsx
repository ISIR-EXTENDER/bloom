/**
 * @vitest-environment jsdom
 */
import type { RuntimeActionPreset } from "@bloom/api-client";
import type { WidgetActionIntent } from "@bloom/widgets";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  dispatchRuntimeActionIntent,
  type RuntimeActionClient,
  toWidgetActionStatus,
} from "./runtime-action-dispatcher";
import { SERVICE_ANSWER_MS, useRuntimeActionDispatcher } from "./use-runtime-action-dispatcher";

const ADD: RuntimeActionPreset = {
  id: "add",
  name: "Add",
  kind: "service-call",
  description: "",
  command: "add",
  topic: "",
  message_type: "",
  payload: {},
  payload_text: "",
  tags: [],
} as unknown as RuntimeActionPreset;

const press: WidgetActionIntent = {
  type: "command",
  command: "add",
  presetId: "add",
  widgetId: "add-button",
  widgetKind: "command-button",
};
const options = { actionPresets: [ADD], appId: "lab", configId: "lab" };

function clientAnswering(status: string, detail: string) {
  return {
    publishRosTopic: vi.fn(),
    dispatchRuntimeAction: vi.fn(async () => ({ status, detail })),
  } as unknown as RuntimeActionClient & { dispatchRuntimeAction: ReturnType<typeof vi.fn> };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("a service call", () => {
  it("names its preset's kind, so the client waits the service timeout", async () => {
    const client = clientAnswering("called", "Service /add answered: {}");
    await dispatchRuntimeActionIntent(client, press, options);

    expect(client.dispatchRuntimeAction).toHaveBeenCalledWith(expect.objectContaining({ preset_id: "add" }), {
      presetKind: "service-call",
    });
  });

  it("refused by its service is a definite refusal, shown with the service's reason", async () => {
    const client = clientAnswering("refused", "Service refused: sum too large");
    const { result } = renderHook(() => useRuntimeActionDispatcher(client));
    let outcome: Awaited<ReturnType<typeof result.current.dispatch>> | undefined;
    await act(async () => {
      outcome = await result.current.dispatch(press, options);
    });

    expect(outcome && toWidgetActionStatus(outcome)).toBe("refused");
    expect(result.current.feedback).toEqual({
      appId: "lab",
      detail: "Service refused: sum too large",
      status: "failed",
      widgetId: "add-button",
    });
  });

  it("answered shows the answer for a moment, then clears it", async () => {
    const client = clientAnswering("called", 'Service /add answered: {"sum": 5}');
    const { result } = renderHook(() => useRuntimeActionDispatcher(client));
    await act(async () => {
      await result.current.dispatch(press, options);
    });

    expect(result.current.feedback).toEqual({
      appId: "lab",
      detail: 'Service /add answered: {"sum": 5}',
      status: "info",
      widgetId: "add-button",
    });
    await act(() => vi.advanceTimersByTimeAsync(SERVICE_ANSWER_MS));
    expect(result.current.feedback).toBeNull();
  });
});
