/**
 * @vitest-environment jsdom
 */
import type { ScreenConfig } from "@bloom/api-client";
import { createDefaultWidgetRegistry, renderScreenDescriptors, type WidgetActionIntent } from "@bloom/widgets";
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CommandLikeWidget } from "./action-renderers";
import { cancelAllPendingEngaging, resetDesiredStates } from "./desired-state";
import { renderWidgetDescriptor } from "./index";
import type { WidgetActionOutcome, WidgetControlState } from "./types";

// ADR 0141: the screen never shows a clean state that may be false.

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
const payloadOf = (intent: WidgetActionIntent) => (intent as { payload?: unknown }).payload;

function toggle(
  onActionIntent: Handler,
  options: {
    id?: string;
    settings?: Record<string, unknown>;
    controlState?: WidgetControlState;
    desiredScope?: string;
  } = {},
) {
  const id = options.id ?? "gripper";
  const [descriptor] = renderScreenDescriptors(
    {
      id: "drive",
      title: "Drive",
      canvas: { preset_id: "native-1280x720", runtime_mode: "fit" },
      widgets: [
        {
          id,
          kind: "toggle",
          title: "Gripper",
          layout: { x: 0, y: 0, width: 300, height: 168 },
          settings: {
            topic: "/gripper_controller/commands",
            messageType: "std_msgs/msg/Bool",
            onLabel: "Closed",
            offLabel: "Open",
            onPayload: "{data: true}",
            offPayload: "{data: false}",
            ...options.settings,
          },
        },
      ],
    } as ScreenConfig,
    createDefaultWidgetRegistry(),
  );
  if (!descriptor) throw new Error("Missing toggle descriptor.");
  return (
    <div>
      {renderWidgetDescriptor(descriptor, {
        controlStateByWidgetId: options.controlState ? { [id]: options.controlState } : undefined,
        desiredScope: options.desiredScope,
        neutralRevision: 0,
        onActionIntent,
      })}
    </div>
  );
}

function button(id: string, settings: Record<string, unknown>, onActionIntent: Handler) {
  return (
    <CommandLikeWidget
      descriptor={
        {
          widget: {
            id,
            kind: "command-button",
            title: id,
            layout: { x: 0, y: 0, width: 10, height: 10 },
            settings: { button_label: id, ...settings },
          },
        } as never
      }
      onActionIntent={onActionIntent}
    />
  );
}

describe("a definite refusal of an off or release state", () => {
  it("keeps showing the confirmed Closed when Open is refused", async () => {
    const onActionIntent = vi.fn((intent: WidgetActionIntent) =>
      payloadOf(intent) === "{data: false}" ? stopped : { accepted: true },
    );
    render(toggle(onActionIntent));
    fireEvent.click(screen.getByRole("button"));
    await settle(0);
    fireEvent.click(screen.getByRole("button"));
    await settle(10_000);

    expect(onActionIntent).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Gripper: Closed" })).not.toHaveAttribute("data-confirmed");
  });

  it("keeps a Snake hold pressed, with the reason, when its release is refused", async () => {
    const onActionIntent = vi.fn((intent: WidgetActionIntent) =>
      intent.type === "topic-publish" && intent.release ? stopped : { accepted: true },
    );
    render(
      button(
        "snake",
        {
          topic: "/mode_request",
          messageType: "std_msgs/msg/String",
          momentary: true,
          payload: { data: "geometric/snake" },
          releasedPayload: { data: "geometric/both" },
        },
        onActionIntent,
      ),
    );
    const snake = screen.getByRole("button");
    fireEvent.pointerDown(snake, { pointerId: 1 });
    await settle(0);
    fireEvent.pointerUp(snake, { pointerId: 1 });
    await settle(10_000);

    expect(onActionIntent).toHaveBeenCalledTimes(2);
    expect(snake).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("The robot is stopped.")).toBeInTheDocument();
  });
});

describe("a newer act on the same topic", () => {
  it("leaves a Close that got no reply not confirmed", async () => {
    const onActionIntent = vi.fn((intent: WidgetActionIntent) =>
      intent.widgetId === "gripper" ? lost() : { accepted: true },
    );
    render(
      <div>
        {toggle(onActionIntent)}
        {button(
          "open-now",
          { topic: "/gripper_controller/commands", messageType: "std_msgs/msg/Bool", payload: "{data: false}" },
          onActionIntent,
        )}
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Gripper/ }));
    await settle(100);
    fireEvent.click(screen.getByRole("button", { name: "open-now" }));
    await settle(10_000);

    expect(onActionIntent.mock.calls.filter(([intent]) => intent.widgetId === "gripper")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Gripper: Closed, not confirmed" })).toHaveAttribute(
      "data-confirmed",
      "false",
    );
  });

  it("leaves a Close still in flight not confirmed, even once answered after the newer act", async () => {
    let answer: (outcome: WidgetActionOutcome) => void = () => {};
    const onActionIntent = vi.fn((intent: WidgetActionIntent) =>
      intent.widgetId === "gripper"
        ? new Promise<WidgetActionOutcome>((resolve) => {
            answer = resolve;
          })
        : { accepted: true },
    );
    render(
      <div>
        {toggle(onActionIntent)}
        {button(
          "open-now",
          { topic: "/gripper_controller/commands", messageType: "std_msgs/msg/Bool", payload: "{data: false}" },
          onActionIntent,
        )}
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Gripper/ }));
    fireEvent.click(screen.getByRole("button", { name: "open-now" }));
    await settle(0);
    expect(screen.getByRole("button", { name: /Gripper: Closed/ })).toHaveAttribute("data-confirmed", "false");

    await act(async () => answer({ accepted: true }));
    expect(screen.getByRole("button", { name: /Gripper: Closed/ })).toHaveAttribute("data-confirmed", "false");
  });
});

describe("a suspend or STOP", () => {
  it("cancels a detached Close: a screen change leaves nothing sending it", async () => {
    const onActionIntent = vi.fn(lost);
    const { unmount } = render(toggle(onActionIntent));
    fireEvent.click(screen.getByRole("button"));
    await settle(100);
    unmount();
    cancelAllPendingEngaging();
    const calls = onActionIntent.mock.calls.length;
    await settle(70_000);

    expect(onActionIntent).toHaveBeenCalledTimes(calls);
  });

  it("never applies a lost Close after STOP and Resume", async () => {
    const onActionIntent = vi.fn<Handler>(lost);
    render(toggle(onActionIntent));
    fireEvent.click(screen.getByRole("button"));
    await settle(300);
    cancelAllPendingEngaging();
    const calls = onActionIntent.mock.calls.length;
    onActionIntent.mockImplementation(() => ({ accepted: true }));
    await settle(10_000);

    expect(onActionIntent).toHaveBeenCalledTimes(calls);
    expect(screen.getByRole("button", { name: "Gripper: Closed, not confirmed" })).toBeInTheDocument();
  });

  it("lets a detached servo Off finish", async () => {
    let lostOffs = 2;
    const onActionIntent = vi.fn((intent: WidgetActionIntent) => {
      if (payloadOf(intent) === "{data: false}" && lostOffs > 0) {
        lostOffs -= 1;
        return lost();
      }
      return { accepted: true };
    });
    const { unmount } = render(
      toggle(onActionIntent, {
        id: "servo",
        settings: { topic: "/ui/visual_servoing/on", messageType: "std_msgs/msg/Bool" },
      }),
    );
    fireEvent.click(screen.getByRole("button"));
    await settle(0);
    fireEvent.click(screen.getByRole("button"));
    unmount();
    cancelAllPendingEngaging();
    await settle(10_000);

    expect(onActionIntent.mock.calls.map(([intent]) => payloadOf(intent))).toEqual([
      "{data: true}",
      "{data: false}",
      "{data: false}",
      "{data: false}",
    ]);
  });
});

describe("a desired state in another app", () => {
  it("is not adopted by a widget with the same id, and never sends through its handler", async () => {
    const appA = vi.fn(lost);
    const appB = vi.fn<Handler>(() => ({ accepted: true }));
    const first = render(toggle(appA, { id: "drive-mode-jaco", desiredScope: "explorer-manager\u0000c" }));
    fireEvent.click(screen.getByRole("button"));
    first.unmount();

    render(toggle(appB, { id: "drive-mode-jaco", desiredScope: "kinova-manager\u0000c" }));
    const callsBefore = appA.mock.calls.length;
    await settle(3000);

    expect(appB).not.toHaveBeenCalled();
    expect(appA.mock.calls.length).toBeGreaterThan(callsBefore);
    expect(screen.getByRole("button", { name: "Gripper: Open" })).not.toHaveAttribute("data-confirmed");
  });
});

describe("a /mode_request toggle", () => {
  const JACO = {
    topic: "/mode_request",
    messageType: "std_msgs/msg/String",
    onLabel: "Jaco",
    offLabel: "Both",
    onPayload: "{data: 'geometric/jaco'}",
    offPayload: "{data: 'geometric/both'}",
  };

  it("follows the requested mode over its own lost send, so STOP's geometric/both turns it off", async () => {
    const onActionIntent = vi.fn<Handler>(lost);
    const { rerender } = render(toggle(onActionIntent, { settings: JACO, controlState: { toggleState: "off" } }));
    fireEvent.click(screen.getByRole("button"));
    await settle(300);
    rerender(toggle(onActionIntent, { settings: JACO, controlState: { toggleState: "on", toggleUnconfirmed: true } }));
    expect(screen.getByRole("button", { name: "Gripper: Jaco, not confirmed" })).toBeInTheDocument();

    cancelAllPendingEngaging();
    rerender(toggle(onActionIntent, { settings: JACO, controlState: { toggleState: "off" } }));
    await settle(0);
    expect(screen.getByRole("button", { name: "Gripper: Both" })).not.toHaveAttribute("data-confirmed");
  });

  it("says Mode not confirmed when the requested mode is unknown", () => {
    render(
      toggle(() => ({ accepted: true }), {
        settings: JACO,
        controlState: { toggleState: "on", toggleUnconfirmed: true },
      }),
    );

    expect(screen.getByRole("button", { name: "Gripper: Jaco, not confirmed" })).toHaveAttribute(
      "data-confirmed",
      "false",
    );
    expect(screen.getByText("Mode not confirmed")).toBeInTheDocument();
  });
});

describe("a held String button with no payload", () => {
  it("sends its command as the data on press, as a one-shot press does", async () => {
    const onActionIntent = vi.fn<Handler>(() => ({ accepted: true }));
    render(
      button(
        "hold-jaco",
        {
          topic: "/mode_request",
          messageType: "std_msgs/msg/String",
          momentary: true,
          command: "geometric/jaco",
          payload: "",
          releasedPayload: { data: "geometric/both" },
        },
        onActionIntent,
      ),
    );
    const hold = screen.getByRole("button");
    fireEvent.pointerDown(hold, { pointerId: 1 });
    await settle(0);
    fireEvent.pointerUp(hold, { pointerId: 1 });
    await settle(0);

    expect(onActionIntent.mock.calls.map(([intent]) => payloadOf(intent))).toEqual([
      { data: "geometric/jaco" },
      { data: "geometric/both" },
    ]);
  });
});
