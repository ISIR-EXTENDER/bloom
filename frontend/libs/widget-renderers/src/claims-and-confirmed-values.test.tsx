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
  claimTarget,
  forgetConfirmedValues,
  isReconcilerSend,
  resetDesiredStates,
  settleForAssertedStop,
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
const stopped: WidgetActionOutcome = { accepted: false, detail: "The robot is stopped.", status: "refused" };
const dataOf = (intent: WidgetActionIntent) => (intent as { payload?: { data?: unknown } }).payload?.data;

function modeButton(id: string, settings: Record<string, unknown>, onActionIntent: Handler) {
  return (
    <CommandLikeWidget
      controlState={settings.momentary ? undefined : { selection: "unselected" }}
      descriptor={
        {
          widget: {
            id,
            kind: "command-button",
            title: id,
            layout: { x: 0, y: 0, width: 10, height: 10 },
            settings: { button_label: id, topic: "/mode_request", messageType: "std_msgs/msg/String", ...settings },
          },
        } as never
      }
      onActionIntent={onActionIntent}
    />
  );
}

const snake = (onActionIntent: Handler) =>
  modeButton(
    "snake",
    { momentary: true, payload: { data: "geometric/snake" }, releasedPayload: { data: "geometric/both" } },
    onActionIntent,
  );
const jaco = (onActionIntent: Handler) => modeButton("jaco", { payload: { data: "geometric/jaco" } }, onActionIntent);

const GRIPPER = {
  topic: "/gripper_controller/commands",
  messageType: "std_msgs/msg/Bool",
  onLabel: "Closed",
  offLabel: "Open",
  onPayload: "{data: true}",
  offPayload: "{data: false}",
};
const SERVO = {
  topic: "/ui/visual_servoing/on",
  messageType: "std_msgs/msg/Bool",
  onLabel: "Servoing",
  offLabel: "Off",
  onPayload: "{data: true}",
  offPayload: "{data: false}",
};

function toggle(
  id: string,
  title: string,
  settings: Record<string, unknown>,
  onActionIntent: Handler,
  options: { neutralRevision?: number; desiredScope?: string } = {},
) {
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
  return (
    <div key={id}>
      {renderWidgetDescriptor(descriptor, {
        desiredScope: options.desiredScope,
        neutralRevision: options.neutralRevision ?? 0,
        onActionIntent,
      })}
    </div>
  );
}

describe("a confirmed Snake latch after a newer mode request", () => {
  it("ends without sending its release when the latch would have expired", async () => {
    const onActionIntent = vi.fn<Handler>(() => ({ accepted: true }));
    render(
      <div>
        {snake(onActionIntent)}
        {jaco(onActionIntent)}
      </div>,
    );
    const [snakeButton, jacoButton] = screen.getAllByRole("button") as [HTMLElement, HTMLElement];
    fireEvent.click(snakeButton);
    await settle(0);
    expect(snakeButton).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(jacoButton);
    await settle(20_000);

    expect(onActionIntent.mock.calls.map(([intent]) => dataOf(intent))).toEqual(["geometric/snake", "geometric/jaco"]);
    expect(snakeButton).toHaveAttribute("aria-pressed", "false");
  });

  it("ends a held Snake without a release on finger lift after a one-shot publish claims the topic", async () => {
    const onActionIntent = vi.fn<Handler>(() => ({ accepted: true }));
    render(snake(onActionIntent));
    const snakeButton = screen.getByRole("button");
    fireEvent.pointerDown(snakeButton, { pointerId: 1 });
    await settle(0);

    act(() => claimTarget("/mode_request"));
    fireEvent.pointerUp(snakeButton, { pointerId: 1 });
    await settle(5000);

    expect(onActionIntent.mock.calls.map(([intent]) => dataOf(intent))).toEqual(["geometric/snake"]);
    expect(snakeButton).toHaveAttribute("aria-pressed", "false");
  });
});

describe("reconciler sends", () => {
  it("are tagged, so the dispatcher does not take them for a new operator act", async () => {
    const seen: boolean[] = [];
    const onActionIntent = vi.fn<Handler>((intent) => {
      seen.push(isReconcilerSend(intent));
      return seen.length === 1 ? lost() : { accepted: true };
    });
    render(toggle("gripper", "Gripper", GRIPPER, onActionIntent));
    fireEvent.click(screen.getByRole("button"));
    await settle(300);

    expect(seen).toEqual([true, true]);
  });

  it("stop when superseded after a lost send, showing the last confirmed state", async () => {
    const outcomes: Array<() => WidgetActionOutcome | Promise<WidgetActionOutcome>> = [
      lost,
      () => ({ accepted: true, detail: "superseded", status: "superseded" }),
    ];
    const onActionIntent = vi.fn<Handler>(() => (outcomes.shift() ?? (() => ({ accepted: true })))());
    render(toggle("gripper", "Gripper", GRIPPER, onActionIntent));
    fireEvent.click(screen.getByRole("button"));
    await settle(10_000);

    expect(onActionIntent).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Gripper: Open" })).not.toHaveAttribute("data-confirmed");
  });
});

describe("the last confirmed value on a target", () => {
  it("survives a screen change: the remounted toggle opens on it", async () => {
    const onActionIntent = vi.fn<Handler>(() => ({ accepted: true }));
    const first = render(toggle("gripper", "Gripper", GRIPPER, onActionIntent, { desiredScope: "a" }));
    fireEvent.click(screen.getByRole("button"));
    await settle(0);
    first.unmount();

    render(toggle("gripper", "Gripper", GRIPPER, onActionIntent, { desiredScope: "a" }));

    expect(screen.getByRole("button", { name: "Gripper: Closed" })).toBeInTheDocument();
  });

  it("is shown by another toggle on the same topic", async () => {
    const onActionIntent = vi.fn<Handler>(() => ({ accepted: true }));
    render(
      <div>
        {toggle("gripper", "Gripper", GRIPPER, onActionIntent)}
        {toggle("gripper-2", "Gripper 2", GRIPPER, onActionIntent)}
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Gripper: Open" }));
    await settle(0);

    expect(screen.getByRole("button", { name: "Gripper 2: Closed" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Gripper 2: Closed" }));
    await settle(0);
    expect(screen.getByRole("button", { name: "Gripper: Open" })).toBeInTheDocument();
  });

  it("is forgotten when its runtime session ends", async () => {
    const onActionIntent = vi.fn<Handler>(() => ({ accepted: true }));
    const first = render(toggle("gripper", "Gripper", GRIPPER, onActionIntent, { desiredScope: "a" }));
    fireEvent.click(screen.getByRole("button"));
    await settle(0);
    first.unmount();
    forgetConfirmedValues("a");

    render(toggle("gripper", "Gripper", GRIPPER, onActionIntent, { desiredScope: "a" }));

    expect(screen.getByRole("button", { name: "Gripper: Open" })).toBeInTheDocument();
  });
});

describe("an asserted STOP", () => {
  it("shows the servo switch off, confirmed, though its STOP-time off was refused", async () => {
    const onActionIntent = vi.fn<Handler>((intent) =>
      (intent as { payload?: unknown }).payload === "{data: false}" ? stopped : { accepted: true },
    );
    const view = render(toggle("servo", "Servo", SERVO, onActionIntent));
    fireEvent.click(screen.getByRole("button"));
    await settle(0);
    view.rerender(toggle("servo", "Servo", SERVO, onActionIntent, { neutralRevision: 1 }));
    await settle(0);
    expect(screen.getByRole("button", { name: "Servo: Servoing" })).toBeInTheDocument();

    act(() => settleForAssertedStop());

    expect(screen.getByRole("button", { name: "Servo: Off" })).not.toHaveAttribute("data-confirmed");
  });

  it("shows a Snake hold released, confirmed, though its release was refused, and the lift sends nothing", async () => {
    const onActionIntent = vi.fn<Handler>((intent) =>
      intent.type === "topic-publish" && intent.release ? stopped : { accepted: true },
    );
    render(snake(onActionIntent));
    const snakeButton = screen.getByRole("button");
    fireEvent.pointerDown(snakeButton, { pointerId: 1 });
    await settle(0);
    fireEvent.pointerUp(snakeButton, { pointerId: 1 });
    await settle(0);
    expect(snakeButton).toHaveAttribute("aria-pressed", "true");

    act(() => settleForAssertedStop());
    fireEvent.pointerUp(snakeButton, { pointerId: 1 });
    await settle(5000);

    expect(snakeButton).toHaveAttribute("aria-pressed", "false");
    expect(snakeButton).not.toHaveAttribute("data-confirmed");
    expect(onActionIntent).toHaveBeenCalledTimes(2);
  });
});
