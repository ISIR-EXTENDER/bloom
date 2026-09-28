/**
 * @vitest-environment jsdom
 */
import type { ScreenConfig } from "@bloom/api-client";
import { renderWidgetDescriptor } from "@bloom/widget-renderers";
import { createDefaultWidgetRegistry, renderScreenDescriptors } from "@bloom/widgets";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RuntimeActionClient } from "./runtime-action-dispatcher";
import { useRuntimeActionDispatcher } from "./use-runtime-action-dispatcher";

// ADR 0141: a suspend or STOP cancels every pending on, press or mode state, including one whose control is gone.

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function gripper(onActionIntent: () => Promise<never>) {
  const [descriptor] = renderScreenDescriptors(
    {
      id: "drive",
      title: "Drive",
      canvas: { preset_id: "native-1280x720", runtime_mode: "fit" },
      widgets: [
        {
          id: "gripper",
          kind: "toggle",
          title: "Gripper",
          layout: { x: 0, y: 0, width: 300, height: 168 },
          settings: {
            topic: "/gripper_controller/commands",
            messageType: "std_msgs/msg/Bool",
            onPayload: "{data: true}",
            offPayload: "{data: false}",
          },
        },
      ],
    } as ScreenConfig,
    createDefaultWidgetRegistry(),
  );
  if (!descriptor) throw new Error("Missing descriptor.");
  return <div>{renderWidgetDescriptor(descriptor, { neutralRevision: 0, onActionIntent })}</div>;
}

describe("suspendTeleop", () => {
  it("stops a detached Close from being sent again", async () => {
    const client = { publishRosTopic: vi.fn() } as unknown as RuntimeActionClient;
    const { result } = renderHook(() => useRuntimeActionDispatcher(client));
    const onActionIntent = vi.fn(() => Promise.reject(new Error("timed out")));
    const view = render(gripper(onActionIntent));
    fireEvent.click(screen.getByRole("button"));
    await act(() => vi.advanceTimersByTimeAsync(300));
    view.unmount();

    act(() => result.current.suspendTeleop());
    const calls = onActionIntent.mock.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(70_000));

    expect(onActionIntent).toHaveBeenCalledTimes(calls);
  });
});
