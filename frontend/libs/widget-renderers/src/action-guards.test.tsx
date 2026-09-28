/**
 * @vitest-environment jsdom
 */
// The guards around a press: a disabled control, the repeat guard, a held key, a refused hold, and a toggle that
// belongs to the screen alone.
import type { ScreenConfig } from "@bloom/api-client";
import { createDefaultWidgetRegistry, renderScreenDescriptors, type WidgetActionIntent } from "@bloom/widgets";
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetCommandStateForTests } from "./command-state";
import { renderScreenWidgets } from "./index";
import type { WidgetActionOutcome, WidgetControlState } from "./types";

Element.prototype.setPointerCapture = vi.fn();
Element.prototype.releasePointerCapture = vi.fn();
Element.prototype.hasPointerCapture = vi.fn(() => true);
globalThis.ResizeObserver = class {
  disconnect() {}
  observe() {}
  unobserve() {}
};

afterEach(() => {
  cleanup();
  resetCommandStateForTests();
  vi.useRealTimers();
});

type Handler = (intent: WidgetActionIntent) => WidgetActionOutcome | Promise<WidgetActionOutcome> | undefined;
const layout = { x: 0, y: 0, width: 240, height: 120 };

function renderWidget(
  widget: Record<string, unknown>,
  handler: Handler = () => ({ accepted: true }),
  options: { controlState?: WidgetControlState; repeatGuardMs?: number } = {},
) {
  const onActionIntent = vi.fn(handler);
  const descriptors = renderScreenDescriptors(
    {
      id: "s",
      title: "S",
      canvas: { preset_id: "native-1280x720", runtime_mode: "fit" },
      widgets: [{ layout, ...widget }],
    } as ScreenConfig,
    createDefaultWidgetRegistry(),
  );
  render(
    <div>
      {renderScreenWidgets(descriptors, {
        conditioning: options.repeatGuardMs ? { repeatGuardMs: options.repeatGuardMs } : undefined,
        controlStateByWidgetId: options.controlState ? { [widget.id as string]: options.controlState } : undefined,
        neutralRevision: 0,
        onActionIntent,
      })}
    </div>,
  );
  return onActionIntent;
}

const snake = {
  id: "snake",
  kind: "command-button",
  title: "Snake",
  settings: {
    momentary: true,
    topic: "/mode_request",
    messageType: "std_msgs/msg/String",
    payload: { data: "geometric/snake" },
    releasedPayload: { data: "geometric/both" },
  },
};
const payloads = (calls: [WidgetActionIntent][]) =>
  calls.map(([intent]) => (intent.type === "topic-publish" ? intent.payload : intent.type));

describe("a disabled control", () => {
  it("sends nothing on a press or a hold, and says why", () => {
    const controlState = { disabled: true, disabledReason: "Another session owns control." };
    const onPress = renderWidget(
      { id: "home", kind: "command-button", title: "Go home", settings: { topic: "/mode_request" } },
      () => undefined,
      { controlState },
    );
    fireEvent.click(screen.getByRole("button", { name: /Go home/ }));
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Go home/ })).toHaveAccessibleName(/Another session owns control/);
    cleanup();

    const onHold = renderWidget(snake, () => undefined, { controlState });
    fireEvent.pointerDown(screen.getByRole("button"), { pointerId: 1 });
    expect(onHold).not.toHaveBeenCalled();
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false");
  });
});

describe("the repeat guard on a hold", () => {
  it("lets a latched hold be released, but drops a new hold inside the guard window", () => {
    const onActionIntent = renderWidget(snake, () => ({ accepted: true }), { repeatGuardMs: 500 });
    const button = screen.getByRole("button");

    fireEvent.click(button, { detail: 0 });
    fireEvent.click(button, { detail: 0 });
    fireEvent.click(button, { detail: 0 });

    expect(payloads(onActionIntent.mock.calls)).toEqual([{ data: "geometric/snake" }, { data: "geometric/both" }]);
    expect(button).toHaveAttribute("aria-pressed", "false");
  });

  it("ignores a key the operator is holding down, so one press is one command", () => {
    const onActionIntent = renderWidget({
      id: "home",
      kind: "command-button",
      title: "Go home",
      settings: { topic: "/mode_request", messageType: "std_msgs/msg/String", payload: { data: "geometric/both" } },
    });
    const button = screen.getByRole("button", { name: /Go home/ });

    const first = fireEvent.keyDown(button, { key: "Enter", repeat: false });
    const held = fireEvent.keyDown(button, { key: "Enter", repeat: true });
    const heldSpace = fireEvent.keyDown(button, { key: " ", repeat: true });

    expect(first).toBe(true);
    expect(held).toBe(false);
    expect(heldSpace).toBe(false);
    expect(onActionIntent).not.toHaveBeenCalled();
  });
});

describe("a hold the robot refuses", () => {
  it("ends at once with the reason, and releases nothing", async () => {
    const onActionIntent = renderWidget(snake, () => ({ accepted: false, detail: "Runtime stop is engaged." }));
    const button = screen.getByRole("button");

    fireEvent.pointerDown(button, { pointerId: 1 });
    await act(async () => undefined);

    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(button).toHaveAccessibleDescription(/Runtime stop is engaged/);
    fireEvent.pointerUp(button, { pointerId: 1 });
    expect(payloads(onActionIntent.mock.calls)).toEqual([{ data: "geometric/snake" }]);
  });

  it("ends when the reply comes back refused later, and a lost reply keeps the hold", async () => {
    let reply: (outcome: WidgetActionOutcome) => void = () => undefined;
    const onActionIntent = renderWidget(snake, () => new Promise<WidgetActionOutcome>((resolve) => (reply = resolve)));
    const button = screen.getByRole("button");

    fireEvent.pointerDown(button, { pointerId: 1 });
    expect(button).toHaveAttribute("aria-pressed", "true");
    await act(async () => {
      reply({ accepted: false, status: "unknown" });
      await Promise.resolve();
    });
    expect(button).toHaveAttribute("aria-pressed", "true");

    fireEvent.pointerUp(button, { pointerId: 1 });
    expect(payloads(onActionIntent.mock.calls)).toEqual([{ data: "geometric/snake" }, { data: "geometric/both" }]);
  });

  it("holds nothing when the button has no topic to hold on", () => {
    const onActionIntent = renderWidget({ ...snake, settings: { momentary: true } });
    fireEvent.pointerDown(screen.getByRole("button"), { pointerId: 1 });
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
    expect(onActionIntent).not.toHaveBeenCalled();
  });
});

describe("a toggle that belongs to the screen", () => {
  it("keeps its own state, tells the runtime each flip, and never reads the store", () => {
    const onActionIntent = renderWidget(
      { id: "lamp", kind: "toggle", title: "Lamp", settings: { initialValue: false, onLabel: "On", offLabel: "Off" } },
      () => Promise.reject(new Error("no handler for a local toggle")),
    );
    const button = screen.getByRole("button", { name: /Lamp/ });
    expect(button).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).not.toHaveAttribute("data-command-state");
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-pressed", "false");

    expect(onActionIntent.mock.calls.map(([intent]) => intent.type === "toggle-state" && intent.nextState)).toEqual([
      "on",
      "off",
    ]);
  });
});
