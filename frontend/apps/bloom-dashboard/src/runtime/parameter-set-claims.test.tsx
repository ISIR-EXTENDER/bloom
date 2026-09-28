/**
 * @vitest-environment jsdom
 */
import type { RosParameterSetRequest, ScreenConfig } from "@bloom/api-client";
import { renderWidgetDescriptor, resetDesiredStates, type WidgetActionOutcome } from "@bloom/widget-renderers";
import { createDefaultWidgetRegistry, renderScreenDescriptors, type WidgetActionIntent } from "@bloom/widgets";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  dispatchRuntimeActionIntent,
  type RuntimeActionClient,
  toWidgetActionStatus,
} from "./runtime-action-dispatcher";

// An older toggle retry landing after a newer set on the same parameter undid it.

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  resetDesiredStates();
  vi.useRealTimers();
});

const settle = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

const BINDING = {
  adapter: "parameter",
  target: "parameter",
  value_mapping: { node: "/cartesian_manager", parameter: "inputs.visual_servoing.enabled" },
};

describe("a parameter toggle retrying a lost set", () => {
  it("stops when another control sets the same parameter", async () => {
    const setRosParameter = vi.fn((request: RosParameterSetRequest) =>
      setRosParameter.mock.calls.length === 1
        ? Promise.reject(new Error("timed out after 4 s."))
        : Promise.resolve({ status: "set" as const, detail: "Set.", ...request }),
    );
    const client = { publishRosTopic: vi.fn(), setRosParameter } as unknown as RuntimeActionClient;
    const [descriptor] = renderScreenDescriptors(
      {
        id: "approach",
        title: "Approach",
        canvas: { preset_id: "native-1280x720", runtime_mode: "fit" },
        widgets: [
          {
            id: "approach-servo-input",
            kind: "toggle",
            title: "Servo input",
            layout: { x: 0, y: 0, width: 464, height: 120 },
            settings: { initialValue: true, onLabel: "Summed", offLabel: "Ignored", runtime_binding: BINDING },
          },
        ],
      } as ScreenConfig,
      createDefaultWidgetRegistry(),
    );
    if (!descriptor) throw new Error("Missing toggle descriptor.");
    const send = async (intent: WidgetActionIntent): Promise<WidgetActionOutcome> => {
      const result = await dispatchRuntimeActionIntent(client, intent);
      const status = toWidgetActionStatus(result);
      return { accepted: status === "accepted", detail: result.detail, status };
    };
    render(<div>{renderWidgetDescriptor(descriptor, { neutralRevision: 0, onActionIntent: send })}</div>);
    fireEvent.click(screen.getByRole("button"));
    await settle(100);

    await act(async () => {
      await dispatchRuntimeActionIntent(client, {
        type: "toggle-state",
        value: true,
        runtimeBinding: BINDING,
        widgetId: "servo-input-2",
        widgetKind: "toggle",
      } as WidgetActionIntent);
    });
    await settle(10_000);

    expect(setRosParameter.mock.calls.map(([request]) => request.value)).toEqual([false, true]);
  });
});
