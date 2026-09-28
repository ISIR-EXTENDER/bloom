/**
 * @vitest-environment jsdom
 */
import type { RuntimeActionPreset, ScreenConfig } from "@bloom/api-client";
import { renderWidgetDescriptor, type WidgetActionOutcome } from "@bloom/widget-renderers";
import { createDefaultWidgetRegistry, renderScreenDescriptors, type WidgetActionIntent } from "@bloom/widgets";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  dispatchRuntimeActionIntent,
  type RuntimeActionClient,
  type RuntimeActionDispatchOptions,
  toWidgetActionStatus,
} from "./runtime-action-dispatcher";

// ADR 0141: an operator's publish through a preset or a slider is the newest act on its topic, so a control's
// pending retry there must not resend after it and undo it.

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const settle = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

const BOTH_PRESET: RuntimeActionPreset = {
  id: "mode-both",
  name: "Both",
  kind: "topic-publish",
  description: "",
  command: "geometric/both",
  topic: "/mode_request",
  message_type: "std_msgs/msg/String",
  payload: { data: "geometric/both" },
  payload_text: "",
  tags: [],
};

function renderToggle(
  topic: string,
  messageType: string,
  onPayload: string,
  offPayload: string,
  client: RuntimeActionClient,
  options: RuntimeActionDispatchOptions,
) {
  const [descriptor] = renderScreenDescriptors(
    {
      id: "drive",
      title: "Drive",
      canvas: { preset_id: "native-1280x720", runtime_mode: "fit" },
      widgets: [
        {
          id: "toggle",
          kind: "toggle",
          title: "Toggle",
          layout: { x: 0, y: 0, width: 300, height: 168 },
          settings: { topic, messageType, onLabel: "On", offLabel: "Off", onPayload, offPayload },
        },
      ],
    } as ScreenConfig,
    createDefaultWidgetRegistry(),
  );
  if (!descriptor) throw new Error("Missing toggle descriptor.");
  const send = async (intent: WidgetActionIntent): Promise<WidgetActionOutcome> => {
    const result = await dispatchRuntimeActionIntent(client, intent, options);
    const status = toWidgetActionStatus(result);
    return { accepted: status === "accepted", detail: result.detail, status };
  };
  render(<div>{renderWidgetDescriptor(descriptor, { neutralRevision: 0, onActionIntent: send })}</div>);
}

describe("a toggle retrying a lost send", () => {
  it("stops when a preset-bound button publishes on its topic", async () => {
    const client = {
      publishRosTopic: vi.fn(() => Promise.reject(new Error("timed out after 4 s."))),
      dispatchRuntimeAction: vi.fn(async () => ({ status: "published" as const, detail: "Published." })),
    } as unknown as RuntimeActionClient;
    const options = { actionPresets: [BOTH_PRESET], appId: "explorer-manager", configId: "explorer-manager" };
    renderToggle(
      "/mode_request",
      "std_msgs/msg/String",
      "{data: 'geometric/jaco'}",
      "{data: 'geometric/both'}",
      client,
      options,
    );
    fireEvent.click(screen.getByRole("button"));
    await settle(100);

    await act(async () => {
      await dispatchRuntimeActionIntent(
        client,
        {
          type: "command",
          command: "geometric/both",
          presetId: "mode-both",
          widgetId: "both",
          widgetKind: "command-button",
        },
        options,
      );
    });
    await settle(10_000);

    expect(client.publishRosTopic).toHaveBeenCalledTimes(1);
    expect(client.dispatchRuntimeAction).toHaveBeenCalledTimes(1);
  });

  it("stops when a slider publishes on its topic", async () => {
    const publishRosTopic = vi.fn((request: { topic: string }) =>
      request.topic === "/ui/level" && publishRosTopic.mock.calls.length === 1
        ? Promise.reject(new Error("timed out after 4 s."))
        : Promise.resolve({
            status: "published" as const,
            detail: "Published.",
            topic: request.topic,
            message_type: "",
          }),
    );
    const client = { publishRosTopic } as unknown as RuntimeActionClient;
    renderToggle("/ui/level", "std_msgs/msg/Float64", "{data: 1.0}", "{data: 0.0}", client, {});
    fireEvent.click(screen.getByRole("button"));
    await settle(100);

    await act(async () => {
      await dispatchRuntimeActionIntent(client, {
        type: "value-change",
        value: 0.5,
        runtimeBinding: { adapter: "topic", value_mapping: { topic: "/ui/level" } },
        widgetId: "level",
        widgetKind: "slider",
      });
    });
    await settle(10_000);

    expect(
      publishRosTopic.mock.calls.map(
        ([request]) =>
          (request as { payload?: unknown; payload_text?: string }).payload_text ??
          (request as { payload?: unknown }).payload,
      ),
    ).toEqual(["{data: 1.0}", { data: 0.5 }]);
  });
});
