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

  // A stick already at rest has nothing to release. Arming it anyway swallowed the operator's whole next
  // push -- after every STOP, settings close and screen switch -- and taught them the pad needs two.
  it("lets a source that was resting at the suspend drive on its very next push", async () => {
    const { result } = renderHook(() => useRuntimeActionDispatcher(client));

    act(() => result.current.contributeTeleop("gamepad", { linear_x: 0.4 }, "base_link"));
    await act(() => vi.advanceTimersByTimeAsync(60));
    act(() => result.current.contributeTeleop("gamepad", null, "base_link"));
    await act(() => vi.advanceTimersByTimeAsync(60));

    act(() => result.current.suspendTeleop());
    const countAfterSuspend = sent.length;

    act(() => result.current.contributeTeleop("gamepad", { linear_x: 0.6 }, "base_link"));
    await act(() => vi.advanceTimersByTimeAsync(60));

    expect(sent.length).toBeGreaterThan(countAfterSuspend);
    expect(sent.at(-1)?.linear.x).toBe(0.6);
  });

  it("stops stamping the old frame once the operator resets to the backend default", async () => {
    // Picking "default" in the frame picker gives an empty frame. It used to be
    // dropped on the way to the pump, so the stick kept streaming ft_frame and
    // the arm went on turning in the tool frame the operator had left.
    const { result } = renderHook(() => useRuntimeActionDispatcher(client));

    act(() => result.current.contributeTeleop("gamepad", { angular_z: 0.4 }, "ft_frame"));
    await act(() => vi.advanceTimersByTimeAsync(60));
    expect(sent.at(-1)).toMatchObject({ frame_id: "ft_frame" });

    act(() => result.current.contributeTeleop("gamepad", { angular_z: 0.4 }, ""));
    await act(() => vi.advanceTimersByTimeAsync(60));

    expect(sent.at(-1)).not.toHaveProperty("frame_id");
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

  it("sends the command even when a listener throws", async () => {
    const { result } = renderHook(() => useRuntimeActionDispatcher(client));
    const after: RuntimeTeleopCommandRequest[] = [];
    act(() => {
      result.current.addTeleopCommandListener(() => {
        throw new Error("the view broke");
      });
      result.current.addTeleopCommandListener((request) => after.push(request));
      result.current.dispatch({
        type: "value-change",
        binding: "joy",
        modeId: "translation",
        publishRateHz: 30,
        runtimeBinding: { adapter: "teleop", target: "translation" },
        value: { x: 0, y: 1 },
        widgetId: "translation",
        widgetKind: "joystick",
        zeroOnRelease: true,
      });
    });
    await act(() => vi.advanceTimersByTimeAsync(40));

    // The arm comes first: a broken observer loses its drawing, never the command.
    expect(sent.length).toBeGreaterThan(0);
    expect(after.length).toBe(sent.length);
  });

  it("tells a listener each twist it sends, until the listener leaves", async () => {
    const { result } = renderHook(() => useRuntimeActionDispatcher(client));
    const heard: RuntimeTeleopCommandRequest[] = [];
    let stop: (() => void) | undefined;
    act(() => {
      stop = result.current.addTeleopCommandListener((request) => heard.push(request));
      result.current.dispatch({
        type: "value-change",
        binding: "joy",
        modeId: "translation",
        publishRateHz: 30,
        runtimeBinding: { adapter: "teleop", target: "translation" },
        value: { x: 0, y: 1 },
        widgetId: "translation",
        widgetKind: "joystick",
        zeroOnRelease: true,
      });
    });
    await act(() => vi.advanceTimersByTimeAsync(40));

    expect(heard.length).toBe(sent.length);
    expect(heard.at(-1)?.linear).toEqual(sent.at(-1)?.linear);

    act(() => stop?.());
    const before = heard.length;
    act(() => {
      result.current.dispatch({
        type: "value-change",
        binding: "joy",
        modeId: "translation",
        publishRateHz: 30,
        runtimeBinding: { adapter: "teleop", target: "translation" },
        value: { x: 0.5, y: 0 },
        widgetId: "translation",
        widgetKind: "joystick",
        zeroOnRelease: true,
      });
    });
    await act(() => vi.advanceTimersByTimeAsync(40));
    expect(heard.length).toBe(before);
    expect(sent.length).toBeGreaterThan(before);
  });

  // A pointermove landing before the pad's reset effect put the push back, and the reset pad never sent
  // its zero: the pump streamed the old vector with nobody touching the screen.
  it("drops a pad move that arrives before the controls return to rest", async () => {
    const { result } = renderHook(() => useRuntimeActionDispatcher(client));
    const move = (x: number) =>
      result.current.dispatch({
        type: "value-change",
        binding: "joy",
        modeId: "translation",
        publishRateHz: 30,
        runtimeBinding: { adapter: "teleop", target: "translation" },
        value: { x, y: 0 },
        widgetId: "translation",
        widgetKind: "joystick",
        zeroOnRelease: true,
      });

    act(() => {
      move(0.8);
    });
    await act(() => vi.advanceTimersByTimeAsync(60));
    let late: Awaited<ReturnType<typeof move>> | undefined;
    act(() => {
      result.current.suspendTeleop();
      void move(0.8).then((outcome) => {
        late = outcome;
      });
    });
    await act(() => vi.advanceTimersByTimeAsync(500));

    expect(late?.status).toBe("blocked");
    expect(result.current.teleopActive).toBe(false);
    expect(sent.at(-1)?.linear.x).toBe(0);

    act(() => {
      move(0.5);
    });
    await act(() => vi.advanceTimersByTimeAsync(60));
    expect(sent.at(-1)?.linear.x).toBe(0.5);
  });

  it("lets a speed slider through in that moment: only a teleop push can put motion back", async () => {
    const { result } = renderHook(() => useRuntimeActionDispatcher(client));
    let outcome: Awaited<ReturnType<typeof result.current.dispatch>> | undefined;
    act(() => {
      result.current.suspendTeleop();
      void result.current
        .dispatch({
          type: "value-change",
          messageType: "std_msgs/msg/Float64",
          topic: "/explorer_user_interfaces/rqt_armcontrol/max_linear_speed",
          value: 0.2,
          widgetId: "speed",
          widgetKind: "slider",
        })
        .then((next) => {
          outcome = next;
        });
    });
    await act(() => vi.advanceTimersByTimeAsync(10));

    expect(outcome?.status).not.toBe("blocked");
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
