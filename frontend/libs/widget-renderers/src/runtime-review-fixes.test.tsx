/**
 * @vitest-environment jsdom
 */
import type { ScreenConfig } from "@bloom/api-client";
import { createDefaultWidgetRegistry, renderScreenDescriptors, type WidgetActionIntent } from "@bloom/widgets";
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CommandLikeWidget } from "./action-renderers";
import {
  cancelAllPendingEngaging,
  claimTarget,
  forgetAllConfirmedState,
  parameterTarget,
  resetDesiredStates,
} from "./desired-state";
import { renderWidgetDescriptor } from "./index";
import type { WidgetActionOutcome } from "./types";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  resetDesiredStates();
  vi.useRealTimers();
});

type Handler = (intent: WidgetActionIntent) => WidgetActionOutcome | Promise<WidgetActionOutcome>;

const settle = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
const lost = () => Promise.reject(new Error("timed out after 4 s."));

const GRIPPER = {
  topic: "/gripper_controller/commands",
  messageType: "std_msgs/msg/Bool",
  onLabel: "Closed",
  offLabel: "Open",
  onPayload: "{data: true}",
  offPayload: "{data: false}",
};
const SERVO_INPUT = {
  initialValue: true,
  onLabel: "Summed",
  offLabel: "Ignored",
  runtime_binding: {
    adapter: "parameter",
    target: "parameter",
    value_mapping: { node: "/cartesian_manager", parameter: "inputs.visual_servoing.enabled" },
  },
};

function toggle(id: string, title: string, settings: Record<string, unknown>, onActionIntent: Handler) {
  const [descriptor] = renderScreenDescriptors(
    {
      id: "drive",
      title: "Drive",
      canvas: { preset_id: "native-1280x720", runtime_mode: "fit" },
      widgets: [{ id, kind: "toggle", title, layout: { x: 0, y: 0, width: 300, height: 168 }, settings }],
    } as ScreenConfig,
    createDefaultWidgetRegistry(),
  );
  if (!descriptor) throw new Error("Missing toggle descriptor.");
  return <div key={id}>{renderWidgetDescriptor(descriptor, { neutralRevision: 0, onActionIntent })}</div>;
}

function targetButton(command: string, onActionIntent: Handler) {
  return (
    <CommandLikeWidget
      controlState={{ selection: "unselected" }}
      descriptor={
        {
          widget: {
            id: "target",
            kind: "command-button",
            title: "Target",
            layout: { x: 0, y: 0, width: 10, height: 10 },
            settings: {
              button_label: "Target",
              topic: "/mode_request",
              messageType: "std_msgs/msg/String",
              payload: { data: command },
            },
          },
        } as never
      }
      onActionIntent={onActionIntent}
    />
  );
}

describe("a one-shot target button on /mode_request", () => {
  it.each(["behaviour/pose_target/pick", "behaviour/joint_target/home"])(
    "sends %s once, never retried by the reconciler",
    async (command) => {
      const onActionIntent = vi.fn<Handler>(lost);
      render(targetButton(command, onActionIntent));
      fireEvent.click(screen.getByRole("button"));
      await settle(10_000);

      expect(onActionIntent).toHaveBeenCalledTimes(1);
    },
  );
});

describe("a send accepted after a newer act on its target", () => {
  it("is not shown clean while the newer act is unanswered", async () => {
    let answerClose: (outcome: WidgetActionOutcome) => void = () => undefined;
    const onActionIntent = vi.fn<Handler>((intent) =>
      (intent as { payload?: unknown }).payload === "{data: true}"
        ? new Promise((resolve) => {
            answerClose = resolve;
          })
        : new Promise<never>(() => {}),
    );
    render(
      <div>
        {toggle("gripper", "Gripper", GRIPPER, onActionIntent)}
        {toggle("gripper-2", "Gripper 2", { ...GRIPPER, initialValue: true }, onActionIntent)}
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Gripper: Open" }));
    await settle(0);
    fireEvent.click(screen.getByRole("button", { name: "Gripper 2: Closed" }));
    await settle(0);
    await act(async () => answerClose({ accepted: true }));

    expect(screen.getByRole("button", { name: /^Gripper: / })).toHaveAttribute("data-confirmed", "false");
  });
});

describe("a publish that claims a toggle's topic", () => {
  it("marks the toggle's settled value not confirmed, until a newer confirmed value", async () => {
    const onActionIntent = vi.fn<Handler>(() => ({ accepted: true }));
    render(toggle("gripper", "Gripper", GRIPPER, onActionIntent));
    fireEvent.click(screen.getByRole("button"));
    await settle(0);
    expect(screen.getByRole("button", { name: "Gripper: Closed" })).not.toHaveAttribute("data-confirmed");

    act(() => claimTarget(GRIPPER.topic));
    expect(screen.getByRole("button", { name: /^Gripper: Closed/ })).toHaveAttribute("data-confirmed", "false");

    fireEvent.click(screen.getByRole("button"));
    await settle(0);
    expect(screen.getByRole("button", { name: "Gripper: Open" })).not.toHaveAttribute("data-confirmed");
  });

  it("marks a remounted toggle not confirmed, not its resting value", async () => {
    const onActionIntent = vi.fn<Handler>(() => ({ accepted: true }));
    const first = render(toggle("gripper", "Gripper", GRIPPER, onActionIntent));
    fireEvent.click(screen.getByRole("button"));
    await settle(0);
    first.unmount();

    act(() => claimTarget(GRIPPER.topic));
    render(toggle("gripper", "Gripper", GRIPPER, onActionIntent));

    expect(screen.getByRole("button", { name: /^Gripper: Closed/ })).toHaveAttribute("data-confirmed", "false");
  });
});

describe("a parameter toggle", () => {
  it("stops retrying once a newer set claims its parameter", async () => {
    const onActionIntent = vi.fn<Handler>(lost);
    render(toggle("approach-servo-input", "Servo input", SERVO_INPUT, onActionIntent));
    fireEvent.click(screen.getByRole("button"));
    await settle(300);
    const calls = onActionIntent.mock.calls.length;

    act(() => claimTarget(parameterTarget("/cartesian_manager", "inputs.visual_servoing.enabled")));
    await settle(10_000);

    expect(onActionIntent).toHaveBeenCalledTimes(calls);
  });
});

describe("STOP or suspend", () => {
  it("cancels a pending gripper Open, so it cannot land after Resume", async () => {
    const onActionIntent = vi.fn<Handler>(() => ({ accepted: true }));
    render(toggle("gripper", "Gripper", GRIPPER, onActionIntent));
    fireEvent.click(screen.getByRole("button"));
    await settle(0);
    onActionIntent.mockImplementation(lost);
    fireEvent.click(screen.getByRole("button"));
    await settle(300);
    cancelAllPendingEngaging();
    const calls = onActionIntent.mock.calls.length;
    onActionIntent.mockImplementation(() => ({ accepted: true }));
    await settle(10_000);

    expect(onActionIntent).toHaveBeenCalledTimes(calls);
    expect(screen.getByRole("button", { name: "Gripper: Open, not confirmed" })).toBeInTheDocument();
  });
});

describe("STOP during a gripper hold's release retry", () => {
  it("sends no open after Resume: a release that actuates is not neutral", async () => {
    const onActionIntent = vi.fn<Handler>(() => ({ accepted: true }));
    render(
      <CommandLikeWidget
        descriptor={
          {
            widget: {
              id: "hold-close",
              kind: "command-button",
              title: "Hold to close",
              layout: { x: 0, y: 0, width: 10, height: 10 },
              settings: {
                button_label: "Hold to close",
                momentary: true,
                topic: GRIPPER.topic,
                messageType: GRIPPER.messageType,
                payload: { data: true },
                releasedPayload: { data: false },
              },
            },
          } as never
        }
        onActionIntent={onActionIntent}
      />,
    );
    const button = screen.getByRole("button");
    fireEvent.pointerDown(button, { pointerId: 1 });
    await settle(0);
    onActionIntent.mockImplementation(lost);
    fireEvent.pointerUp(button, { pointerId: 1 });
    await settle(300);
    cancelAllPendingEngaging();
    const calls = onActionIntent.mock.calls.length;
    onActionIntent.mockImplementation(() => ({ accepted: true }));
    await settle(10_000);

    expect(onActionIntent).toHaveBeenCalledTimes(calls);
  });
});

describe("a new runtime session", () => {
  it("forgets confirmed values and settled controls", async () => {
    const onActionIntent = vi.fn<Handler>(() => ({ accepted: true }));
    const first = render(toggle("gripper", "Gripper", GRIPPER, onActionIntent));
    fireEvent.click(screen.getByRole("button"));
    await settle(0);
    expect(screen.getByRole("button", { name: "Gripper: Closed" })).toBeInTheDocument();

    act(() => forgetAllConfirmedState());
    expect(screen.getByRole("button", { name: "Gripper: Open" })).not.toHaveAttribute("data-confirmed");
    first.unmount();
    render(toggle("gripper", "Gripper", GRIPPER, onActionIntent));
    expect(screen.getByRole("button", { name: "Gripper: Open" })).toBeInTheDocument();
  });
});
