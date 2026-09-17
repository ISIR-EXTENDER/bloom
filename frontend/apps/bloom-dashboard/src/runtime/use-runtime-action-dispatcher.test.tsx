/**
 * @vitest-environment jsdom
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RuntimeActionClient, RuntimeTeleopCommandRequest } from "./runtime-action-dispatcher";
import { useRuntimeActionDispatcher } from "./use-runtime-action-dispatcher";

describe("runtime teleop suspension", () => {
  let sent: RuntimeTeleopCommandRequest[];
  let client: RuntimeActionClient;

  beforeEach(() => {
    vi.useFakeTimers();
    sent = [];
    client = {
      publishRosTopic: vi.fn(),
      sendTeleopCommand: vi.fn(async (request) => {
        sent.push(request);
        return {
          type: "teleop_ack" as const,
          detail: "Accepted.",
          payload: { ...request, frame_id: request.frame_id ?? "", status: "accepted" as const },
        };
      }),
    };
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("sends a final zero and requires an external source to return neutral", async () => {
    const { result } = renderHook(() => useRuntimeActionDispatcher(client));

    act(() => result.current.contributeTeleop("gamepad", { linear_x: 0.7 }, "base_link"));
    await act(() => vi.advanceTimersByTimeAsync(60));
    expect(sent.at(-1)?.linear.x).toBe(0.7);

    act(() => result.current.suspendTeleop());
    expect(sent.at(-1)).toMatchObject({
      angular: { x: 0, y: 0, z: 0 },
      frame_id: "base_link",
      linear: { x: 0, y: 0, z: 0 },
    });
    const countAfterSuspend = sent.length;

    act(() => result.current.contributeTeleop("gamepad", { linear_x: 0.7 }, "base_link"));
    await act(() => vi.advanceTimersByTimeAsync(200));
    expect(sent).toHaveLength(countAfterSuspend);

    act(() => result.current.contributeTeleop("gamepad", null, "base_link"));
    act(() => result.current.contributeTeleop("gamepad", { linear_x: 0.7 }, "base_link"));
    await act(() => vi.advanceTimersByTimeAsync(60));
    expect(sent.at(-1)?.linear.x).toBe(0.7);
  });

  it("suspends immediately when the operating window loses focus", async () => {
    const { result } = renderHook(() => useRuntimeActionDispatcher(client));
    act(() => result.current.contributeTeleop("gamepad", { angular_z: 0.5 }));
    await act(() => vi.advanceTimersByTimeAsync(60));

    act(() => window.dispatchEvent(new Event("blur")));

    expect(sent.at(-1)).toMatchObject({
      angular: { x: 0, y: 0, z: 0 },
      linear: { x: 0, y: 0, z: 0 },
    });
  });

  it("coalesces rapid widget updates before they reach the WebSocket client", async () => {
    const { result } = renderHook(() => useRuntimeActionDispatcher(client));

    act(() => {
      for (let index = 1; index <= 20; index += 1) {
        result.current.dispatch({
          type: "value-change",
          binding: "joy",
          modeId: "translation",
          publishRateHz: 30,
          runtimeBinding: { adapter: "teleop", target: "translation" },
          value: { x: index / 20, y: 0 },
          widgetId: "translation",
          widgetKind: "joystick",
          zeroOnRelease: true,
        });
      }
    });
    await act(() => vi.advanceTimersByTimeAsync(40));

    expect(sent).toHaveLength(2);
    expect(sent.at(-1)?.linear.x).toBe(1);
  });

  it("returns transport failures and exposes them as operator feedback", async () => {
    client.publishRosTopic = vi.fn(async () => {
      throw new Error("ROS bridge disconnected.");
    });
    const { result } = renderHook(() => useRuntimeActionDispatcher(client));
    let dispatchResult: Awaited<ReturnType<typeof result.current.dispatch>> | undefined;

    await act(async () => {
      dispatchResult = await result.current.dispatch(
        {
          messageType: "std_msgs/msg/Bool",
          payload: { data: true },
          topic: "/ui/visual_servoing/on",
          type: "topic-publish",
          widgetId: "visual-servoing",
          widgetKind: "toggle",
        },
        { appId: "sandbox" },
      );
    });

    expect(dispatchResult).toMatchObject({ status: "failed", detail: "ROS bridge disconnected." });
    expect(result.current.feedback).toEqual({
      appId: "sandbox",
      detail: "ROS bridge disconnected.",
      status: "failed",
      widgetId: "visual-servoing",
    });
  });
});
