/**
 * @vitest-environment jsdom
 */
import type { ScreenConfig } from "@bloom/api-client";
import { createDefaultWidgetRegistry, renderScreenDescriptors, type WidgetActionIntent } from "@bloom/widgets";
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CommandLikeWidget } from "./action-renderers";
import { resetDesiredStates, settleForNewSession } from "./desired-state";
import { renderWidgetDescriptor } from "./index";
import type { WidgetActionOutcome, WidgetControlState } from "./types";

// ADR 0141: one state per robot target, whichever control acted; the three bugs the per-widget model kept finding.

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
const dataOf = (intent: WidgetActionIntent) => (intent as { payload?: { data?: unknown } }).payload?.data;
const refused: WidgetActionOutcome = { accepted: false, detail: "Refused.", status: "refused" };

const GRIPPER = {
  topic: "/gripper_controller/commands",
  messageType: "std_msgs/msg/Bool",
  onLabel: "Closed",
  offLabel: "Open",
  onPayload: "{data: true}",
  offPayload: "{data: false}",
};
const LIGHT = { ...GRIPPER, topic: "/io/digital_out_1", onLabel: "Lit", offLabel: "Dark" };
const SERVO = { ...GRIPPER, topic: "/ui/visual_servoing/on", onLabel: "Servoing", offLabel: "Off" };

function toggle(
  id: string,
  title: string,
  settings: Record<string, unknown>,
  onActionIntent: Handler,
  controlState?: WidgetControlState,
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
        controlStateByWidgetId: controlState ? { [id]: controlState } : undefined,
        neutralRevision: 0,
        onActionIntent,
      })}
    </div>
  );
}

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

describe("a reconnect", () => {
  it("keeps a gripper and a digital output as the robot holds them, and reads servoing off", async () => {
    const onActionIntent = vi.fn<Handler>(() => ({ accepted: true }));
    render(
      <div>
        {toggle("gripper", "Gripper", GRIPPER, onActionIntent)}
        {toggle("light", "Light", LIGHT, onActionIntent)}
        {toggle("servo", "Servo", SERVO, onActionIntent)}
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Gripper: Open" }));
    fireEvent.click(screen.getByRole("button", { name: "Light: Dark" }));
    fireEvent.click(screen.getByRole("button", { name: "Servo: Off" }));
    await settle(0);

    act(() => settleForNewSession());

    expect(screen.getByRole("button", { name: "Gripper: Closed" })).not.toHaveAttribute("data-confirmed");
    expect(screen.getByRole("button", { name: "Light: Lit" })).not.toHaveAttribute("data-confirmed");
    expect(screen.getByRole("button", { name: "Servo: Off" })).not.toHaveAttribute("data-confirmed");
  });

  it("ends a Snake hold without a release: the server released it with the old session", async () => {
    const onActionIntent = vi.fn<Handler>(() => ({ accepted: true }));
    render(snake(onActionIntent));
    const snakeButton = screen.getByRole("button");
    fireEvent.pointerDown(snakeButton, { pointerId: 1 });
    await settle(0);

    act(() => settleForNewSession());
    fireEvent.pointerUp(snakeButton, { pointerId: 1 });
    await settle(5000);

    expect(onActionIntent.mock.calls.map(([intent]) => dataOf(intent))).toEqual(["geometric/snake"]);
    expect(snakeButton).toHaveAttribute("aria-pressed", "false");
  });
});

describe("two toggles on one topic", () => {
  it("both leave the clean state while the other's newer act is unanswered, and agree", async () => {
    let answerOpen: (outcome: WidgetActionOutcome) => void = () => undefined;
    const onActionIntent = vi.fn<Handler>((intent) =>
      intent.widgetId === "gripper-2"
        ? new Promise((resolve) => {
            answerOpen = resolve;
          })
        : { accepted: true },
    );
    render(
      <div>
        {toggle("gripper", "Gripper", GRIPPER, onActionIntent)}
        {toggle("gripper-2", "Gripper 2", GRIPPER, onActionIntent)}
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Gripper: Open" }));
    await settle(0);
    fireEvent.click(screen.getByRole("button", { name: "Gripper 2: Closed" }));
    await settle(600);

    expect(screen.getByRole("button", { name: "Gripper: Open, not confirmed" })).toHaveAttribute(
      "data-confirmed",
      "false",
    );
    expect(screen.getByRole("button", { name: "Gripper 2: Open, not confirmed" })).toHaveAttribute(
      "data-confirmed",
      "false",
    );

    await act(async () => answerOpen(refused));
    expect(screen.getByRole("button", { name: "Gripper: Closed" })).not.toHaveAttribute("data-confirmed");
    expect(screen.getByRole("button", { name: "Gripper 2: Closed" })).not.toHaveAttribute("data-confirmed");
  });
});

describe("a Snake hold and a newer mode request", () => {
  it.each([
    ["refused", refused],
    ["blocked", { accepted: false, detail: "Not allowed.", status: "refused" } satisfies WidgetActionOutcome],
  ])("keeps the hold when the request is %s, and still sends its release", async (_name, outcome) => {
    const onActionIntent = vi.fn<Handler>((intent) => (intent.widgetId === "jaco" ? outcome : { accepted: true }));
    render(
      <div>
        {snake(onActionIntent)}
        {jaco(onActionIntent)}
      </div>,
    );
    const [snakeButton, jacoButton] = screen.getAllByRole("button") as [HTMLElement, HTMLElement];
    fireEvent.pointerDown(snakeButton, { pointerId: 1 });
    await settle(0);
    fireEvent.click(jacoButton);
    await settle(0);
    expect(snakeButton).toHaveAttribute("aria-pressed", "true");

    fireEvent.pointerUp(snakeButton, { pointerId: 1 });
    await settle(0);

    expect(onActionIntent.mock.calls.map(([intent]) => dataOf(intent))).toEqual([
      "geometric/snake",
      "geometric/jaco",
      "geometric/both",
    ]);
    expect(snakeButton).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps a latched hold through a refused request, and its expiry still releases", async () => {
    const onActionIntent = vi.fn<Handler>((intent) => (intent.widgetId === "jaco" ? refused : { accepted: true }));
    render(
      <div>
        {snake(onActionIntent)}
        {jaco(onActionIntent)}
      </div>,
    );
    const [snakeButton, jacoButton] = screen.getAllByRole("button") as [HTMLElement, HTMLElement];
    fireEvent.click(snakeButton);
    await settle(0);
    fireEvent.click(jacoButton);
    await settle(20_000);

    expect(onActionIntent.mock.calls.map(([intent]) => dataOf(intent))).toEqual([
      "geometric/snake",
      "geometric/jaco",
      "geometric/both",
    ]);
  });

  it("ends the hold silently once the request's outcome is unknown", async () => {
    const onActionIntent = vi.fn<Handler>((intent) =>
      intent.widgetId === "jaco" ? Promise.reject(new Error("timed out")) : { accepted: true },
    );
    render(
      <div>
        {snake(onActionIntent)}
        {jaco(onActionIntent)}
      </div>,
    );
    const [snakeButton, jacoButton] = screen.getAllByRole("button") as [HTMLElement, HTMLElement];
    fireEvent.pointerDown(snakeButton, { pointerId: 1 });
    await settle(0);
    fireEvent.click(jacoButton);
    await settle(0);
    fireEvent.pointerUp(snakeButton, { pointerId: 1 });
    await settle(0);

    expect(onActionIntent.mock.calls.every(([intent]) => dataOf(intent) !== "geometric/both")).toBe(true);
    expect(snakeButton).toHaveAttribute("aria-pressed", "false");
  });
});

describe("a /mode_request toggle whose shaping mode is another one", () => {
  const BOTH_SNAKE = {
    topic: "/mode_request",
    messageType: "std_msgs/msg/String",
    onLabel: "Snake",
    offLabel: "Both",
    onPayload: "{data: 'geometric/snake'}",
    offPayload: "{data: 'geometric/both'}",
    variant: "mode-segmented",
  };

  it("lights neither segment and does not say Both", () => {
    render(toggle("shape", "Shape", BOTH_SNAKE, () => ({ accepted: true }), { toggleState: "other" }));
    const button = screen.getByRole("button", { name: "Shape: Other mode" });

    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(button.querySelectorAll('[data-active="true"]')).toHaveLength(0);
  });

  it("says Mode not confirmed while the shaping mode is unknown", () => {
    render(
      toggle("shape", "Shape", BOTH_SNAKE, () => ({ accepted: true }), {
        toggleState: "other",
        toggleUnconfirmed: true,
      }),
    );

    expect(screen.getByRole("button", { name: "Shape: Other mode, not confirmed" })).toHaveAttribute(
      "data-confirmed",
      "false",
    );
    expect(screen.getByText("Mode not confirmed")).toBeInTheDocument();
  });
});
