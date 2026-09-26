/**
 * @vitest-environment jsdom
 */

import { DEFAULT_RUNTIME_POLICY } from "@bloom/api-client";
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

  it("ends a suspend with a zero when the first move is still waiting for its ack", async () => {
    let ackFirst: (() => void) | undefined;
    client.sendTeleopCommand = vi.fn((request: RuntimeTeleopCommandRequest) => {
      sent.push(request);
      const ack = {
        type: "teleop_ack" as const,
        detail: "Accepted.",
        payload: { ...request, frame_id: request.frame_id ?? "", status: "accepted" as const },
      };
      if (sent.length === 1) {
        return new Promise<typeof ack>((resolve) => {
          ackFirst = () => resolve(ack);
        });
      }
      return Promise.resolve(ack);
    });
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
      void move(0.8);
      void move(0.6);
    });
    act(() => result.current.suspendTeleop());
    expect(sent.at(-1)).toMatchObject({ angular: { x: 0, y: 0, z: 0 }, linear: { x: 0, y: 0, z: 0 } });

    await act(async () => {
      ackFirst?.();
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(sent.some((request) => request.linear.x === 0.6)).toBe(false);
    expect(sent.at(-1)?.linear.x).toBe(0);
  });

  it("returns the controls to rest when the stream is refused for good", async () => {
    client.sendTeleopCommand = vi.fn(async () => {
      throw new Error("Socket is closed.");
    });
    const { result } = renderHook(() => useRuntimeActionDispatcher(client));
    const revisionBefore = result.current.neutralRevision;

    act(() => result.current.contributeTeleop("gamepad", { linear_x: 0.7 }, "base_link"));
    expect(result.current.teleopActive).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(3000));

    expect(result.current.neutralRevision).toBeGreaterThan(revisionBefore);
    expect(result.current.teleopActive).toBe(false);
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

  it("re-resolves the frame of a move that waited in the rate gate", async () => {
    const { result } = renderHook(() => useRuntimeActionDispatcher(client));
    const options = {
      allowedCommandFrameIds: ["base_link", "effector_frame"],
      runtimePolicy: { ...DEFAULT_RUNTIME_POLICY, command_frame_id: "base_link" },
    };
    const turn = (x: number) =>
      result.current.dispatch(
        {
          type: "value-change",
          binding: "joy",
          modeId: "rotation",
          publishRateHz: 30,
          runtimeBinding: { adapter: "teleop", value_mapping: { frame_id: "effector_frame" } },
          value: { x, y: 0 },
          widgetId: "tilt",
          widgetKind: "joystick",
          zeroOnRelease: true,
        },
        options,
      );

    act(() => {
      void turn(0.2);
      void turn(0.3);
    });
    // A second hand turning under the session frame arrives while the move waits: one frame must now give way.
    act(() => result.current.contributeTeleop("gamepad", { angular_z: 0.4 }, "base_link"));
    await act(() => vi.advanceTimersByTimeAsync(40));

    expect(sent[0]).toMatchObject({ frame_id: "effector_frame" });
    expect(sent[1]).toMatchObject({ angular: { x: 0.3, z: 0.4 }, frame_id: "base_link" });
  });

  it("streams two pads on two targets without mixing their pushes", async () => {
    const { result } = renderHook(() => useRuntimeActionDispatcher(client));
    const options = { runtimePolicy: { ...DEFAULT_RUNTIME_POLICY, allowed_teleop_targets: ["*"] } };
    const push = (widgetId: string, target: string, value: { x: number; y: number }) =>
      result.current.dispatch(
        {
          type: "value-change",
          binding: "joy",
          modeId: "translation",
          publishRateHz: 30,
          runtimeBinding: { adapter: "teleop", value_mapping: { target_topic: target } },
          value,
          widgetId,
          widgetKind: "joystick",
          zeroOnRelease: true,
        },
        options,
      );

    act(() => {
      void push("pad-a", "/joystick_cartesian_command", { x: 0.6, y: 0 });
      void push("pad-b", "/visual_servoing_command", { x: 0, y: 0.4 });
    });
    await act(() => vi.advanceTimersByTimeAsync(200));
    const last = (target: string) => sent.filter((request) => request.target === target).at(-1);

    expect(last("/joystick_cartesian_command")?.linear).toEqual({ x: 0.6, y: 0, z: 0 });
    expect(last("/visual_servoing_command")?.linear).toEqual({ x: 0, y: 0.4, z: 0 });

    act(() => result.current.suspendTeleop());
    expect(last("/joystick_cartesian_command")?.linear).toEqual({ x: 0, y: 0, z: 0 });
    expect(last("/visual_servoing_command")?.linear).toEqual({ x: 0, y: 0, z: 0 });
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
  describe("a refused teleop value", () => {
    const slider = (value: number) =>
      ({
        type: "value-change",
        binding: "z",
        runtimeBinding: { adapter: "teleop", axis_mapping: { value: { component: "linear_z" } } },
        value,
        widgetId: "z-slider",
        widgetKind: "slider",
      }) as const;
    const joystick = (x: number) =>
      ({
        type: "value-change",
        binding: "joy",
        modeId: "translation",
        publishRateHz: 30,
        runtimeBinding: { adapter: "teleop", target: "translation" },
        value: { x, y: 0 },
        widgetId: "translation",
        widgetKind: "joystick",
        zeroOnRelease: true,
      }) as const;
    const accept = (request: RuntimeTeleopCommandRequest) => {
      sent.push(request);
      return Promise.resolve({
        type: "teleop_ack" as const,
        detail: "Accepted.",
        payload: { ...request, frame_id: request.frame_id ?? "", status: "accepted" as const },
      });
    };

    it("leaves the composed twist when its send times out, as the slider snaps to rest", async () => {
      client.sendTeleopCommand = vi.fn((request: RuntimeTeleopCommandRequest) =>
        request.linear.z === 0.5 ? Promise.reject(new Error("Request timed out.")) : accept(request),
      );
      const { result } = renderHook(() => useRuntimeActionDispatcher(client));
      let outcome: Awaited<ReturnType<typeof result.current.dispatch>> | undefined;

      await act(async () => {
        outcome = await result.current.dispatch(slider(0.5));
      });
      expect(outcome?.status).toBe("failed");
      expect(result.current.teleopActive).toBe(false);

      act(() => {
        void result.current.dispatch(joystick(0.4));
      });
      await act(() => vi.advanceTimersByTimeAsync(60));
      expect(sent.at(-1)?.linear).toEqual({ x: 0.4, y: 0, z: 0 });
    });

    it("ends the wire on what is still held once a failed value is withdrawn", async () => {
      // The timed-out value may still have been published: the last frame must not be it.
      client.sendTeleopCommand = vi.fn((request: RuntimeTeleopCommandRequest) => {
        if (request.linear.z === 0.5) {
          sent.push(request);
          return Promise.reject(new Error("Request timed out."));
        }
        return accept(request);
      });
      const { result } = renderHook(() => useRuntimeActionDispatcher(client));

      act(() => {
        void result.current.dispatch(joystick(0.4));
      });
      await act(() => vi.advanceTimersByTimeAsync(60));
      act(() => {
        void result.current.dispatch(slider(0.5));
      });
      await act(() => vi.advanceTimersByTimeAsync(60));
      expect(sent.some((request) => request.linear.z === 0.5)).toBe(true);

      expect(sent.at(-1)?.linear).toEqual({ x: 0.4, y: 0, z: 0 });
    });

    it("refuses a widget's own frame the robot does not allow, even when a conflict hides it", async () => {
      client.sendTeleopCommand = vi.fn(accept);
      const { result } = renderHook(() => useRuntimeActionDispatcher(client));
      const turning = (widgetId: string, frameId: string, x: number) =>
        ({
          type: "value-change",
          binding: "joy",
          runtimeBinding: {
            adapter: "teleop",
            axis_mapping: { x: { component: "angular_x" } },
            value_mapping: { frame_id: frameId },
          },
          value: { x, y: 0 },
          widgetId,
          widgetKind: "joystick",
        }) as const;
      const options = {
        allowedCommandFrameIds: ["base_link", "hybrid_frame"],
        runtimePolicy: {
          allowed_teleop_targets: ["*"],
          command_frame_id: "base_link",
        } as unknown as NonNullable<Parameters<typeof result.current.dispatch>[1]>["runtimePolicy"],
      };
      let pending: ReturnType<typeof result.current.dispatch> | undefined;

      act(() => {
        void result.current.dispatch(turning("rot-b", "hybrid_frame", 0.3), options);
      });
      await act(() => vi.advanceTimersByTimeAsync(60));
      act(() => {
        pending = result.current.dispatch(turning("rot-a", "ft_frame", 0.4), options);
      });
      await act(() => vi.advanceTimersByTimeAsync(60));
      act(() => {
        void result.current.dispatch(turning("rot-b", "hybrid_frame", 0), options);
      });
      await act(() => vi.advanceTimersByTimeAsync(200));

      expect((await pending)?.status).toBe("blocked");
      expect(sent.some((request) => request.frame_id === "ft_frame")).toBe(false);
      expect(sent.at(-1)?.angular.x).toBe(0);
    });

    it("does not withdraw a newer value of the same widget when the older failure lands late", async () => {
      let failFirst: ((error: Error) => void) | undefined;
      client.sendTeleopCommand = vi.fn((request: RuntimeTeleopCommandRequest) =>
        request.linear.z === 0.5
          ? new Promise<never>((_, reject) => {
              failFirst = reject;
            })
          : accept(request),
      );
      const { result } = renderHook(() => useRuntimeActionDispatcher(client));

      act(() => {
        void result.current.dispatch(slider(0.5));
        void result.current.dispatch(slider(0.3));
      });
      await act(async () => {
        failFirst?.(new Error("Request timed out."));
        await vi.advanceTimersByTimeAsync(60);
      });
      expect(sent.at(-1)?.linear.z).toBe(0.3);

      act(() => {
        void result.current.dispatch(joystick(0.4));
      });
      await act(() => vi.advanceTimersByTimeAsync(60));
      expect(sent.at(-1)?.linear).toEqual({ x: 0.4, y: 0, z: 0.3 });
      expect(result.current.teleopActive).toBe(true);
    });
  });
});
