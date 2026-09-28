/**
 * @vitest-environment jsdom
 */
import type { ScreenConfig } from "@bloom/api-client";
import { createDefaultWidgetRegistry, renderScreenDescriptors, type WidgetActionIntent } from "@bloom/widgets";
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { applyCommandStateMessage, resetCommandStateForTests } from "./command-state";
import { renderWidgetDescriptor } from "./index";
import type { WidgetActionOutcome, WidgetControlState } from "./types";

afterEach(() => {
  cleanup();
  resetCommandStateForTests();
  vi.useRealTimers();
});

const SERVO = {
  id: "servo",
  title: "Servo",
  settings: {
    topic: "/ui/visual_servoing/on",
    messageType: "std_msgs/msg/Bool",
    onLabel: "Servoing",
    offLabel: "Off",
    onPayload: "{data: true}",
    offPayload: "{data: false}",
  },
};
const GRIPPER = {
  id: "gripper",
  title: "Gripper",
  settings: {
    topic: "/gripper_controller/commands",
    messageType: "std_msgs/msg/Float64MultiArray",
    onLabel: "Closed",
    offLabel: "Open",
    onPayload: "{data: [0.8]}",
    offPayload: "{data: [0.0]}",
  },
};

let revision = 0;
function push(entries: Record<string, { value: unknown; source?: string; by?: string }>) {
  revision += 1;
  applyCommandStateMessage({
    type: "command_state",
    revision,
    self: "me",
    snapshot: Object.fromEntries(
      Object.entries(entries).map(([key, entry]) => [
        key,
        {
          value: entry.value,
          source: (entry.source ?? "commanded") as "commanded",
          updated_at: "",
          by: entry.by ?? "me",
          revision,
        },
      ]),
    ),
  });
}

function renderToggle(
  widget: typeof SERVO,
  handler: (intent: WidgetActionIntent) => WidgetActionOutcome | Promise<WidgetActionOutcome> = () => ({
    accepted: true,
  }),
) {
  const onActionIntent = vi.fn(handler);
  const [descriptor] = renderScreenDescriptors(
    {
      id: "drive",
      title: "Drive",
      canvas: { preset_id: "native-1280x720", runtime_mode: "fit" },
      widgets: [{ kind: "toggle", layout: { x: 0, y: 0, width: 300, height: 168 }, ...widget }],
    } as ScreenConfig,
    createDefaultWidgetRegistry(),
  );
  if (!descriptor) throw new Error("Missing descriptor.");
  const view = (neutralRevision: number, controlState?: WidgetControlState) => (
    <div>
      {renderWidgetDescriptor(descriptor, {
        controlStateByWidgetId: controlState ? { [widget.id]: controlState } : undefined,
        neutralRevision,
        onActionIntent,
      })}
    </div>
  );
  const utils = render(view(0));
  return {
    onActionIntent,
    rerender: (neutral: number, state?: WidgetControlState) => utils.rerender(view(neutral, state)),
    unmount: utils.unmount,
  };
}

const sent = (onActionIntent: ReturnType<typeof vi.fn>) =>
  onActionIntent.mock.calls.map(([intent]) => [(intent as { payload?: unknown }).payload, intent.release]);

describe("the visual servoing switch", () => {
  it("reads on from the store and switches off once on a suspend, as a release", () => {
    act(() => push({ "/ui/visual_servoing/on": { value: { data: true } } }));
    const { onActionIntent, rerender } = renderToggle(SERVO);
    expect(screen.getByRole("button", { name: /Servo: Servoing/ })).toBeInTheDocument();

    rerender(1);
    rerender(1);

    expect(sent(onActionIntent)).toEqual([["{data: false}", true]]);
  });

  it("switches off when STOP disables it and when it unmounts", () => {
    act(() => push({ "/ui/visual_servoing/on": { value: { data: true } } }));
    const stopped = renderToggle(SERVO);
    stopped.rerender(0, { disabled: true });
    expect(sent(stopped.onActionIntent)).toEqual([["{data: false}", true]]);
    cleanup();

    const left = renderToggle(SERVO);
    left.unmount();
    expect(sent(left.onActionIntent)).toEqual([["{data: false}", true]]);
  });

  it("sends nothing on a suspend when the store says it is off or does not know", () => {
    const unknown = renderToggle(SERVO);
    unknown.rerender(1);
    expect(unknown.onActionIntent).not.toHaveBeenCalled();
    cleanup();

    act(() => push({ "/ui/visual_servoing/on": { value: { data: false } } }));
    const off = renderToggle(SERVO);
    off.rerender(1);
    expect(off.onActionIntent).not.toHaveBeenCalled();
  });

  it("switches off an On still sending when the suspend comes", () => {
    const { onActionIntent, rerender } = renderToggle(SERVO, () => new Promise(() => undefined));
    act(() => push({ "/ui/visual_servoing/on": { value: { data: false }, by: "robot" } }));
    fireEvent.click(screen.getByRole("button"));

    rerender(1);

    expect(sent(onActionIntent)).toEqual([
      ["{data: true}", undefined],
      ["{data: false}", true],
    ]);
  });

  it("shows servoing live only while the store measures it", () => {
    act(() => push({ "/ui/visual_servoing/on": { value: { data: true } }, "servoing:active": { value: true } }));
    renderToggle(SERVO);
    expect(screen.getByText("Servoing", { selector: ".bloom-toggle-live" })).toBeInTheDocument();

    act(() => push({ "/ui/visual_servoing/on": { value: { data: true } }, "servoing:active": { value: false } }));
    expect(screen.queryByText("Servoing", { selector: ".bloom-toggle-live" })).not.toBeInTheDocument();
  });
});

describe("another toggle on a suspend", () => {
  it("leaves the gripper as the store holds it", () => {
    act(() => push({ "/gripper_controller/commands": { value: { data: [0.8] }, source: "measured", by: "robot" } }));
    const { onActionIntent, rerender } = renderToggle(GRIPPER as typeof SERVO);
    rerender(1);

    expect(onActionIntent).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Gripper: Closed, reported by the robot" })).toBeInTheDocument();
  });
});
