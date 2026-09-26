/**
 * @vitest-environment jsdom
 */
import type { ScreenConfig } from "@bloom/api-client";
import { createDefaultWidgetRegistry, renderScreenDescriptors, type WidgetActionIntent } from "@bloom/widgets";
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWidgetDescriptor } from "./index";
import type { WidgetControlState } from "./types";

afterEach(cleanup);

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
    messageType: "std_msgs/msg/Bool",
    onLabel: "Closed",
    offLabel: "Open",
    onPayload: "{data: true}",
    offPayload: "{data: false}",
  },
};

function renderToggle(widget: typeof SERVO) {
  const onActionIntent = vi.fn((_intent: WidgetActionIntent) => ({ accepted: true }));
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
  fireEvent.click(screen.getByRole("button"));
  return {
    onActionIntent,
    rerender: (revision: number, state?: WidgetControlState) => utils.rerender(view(revision, state)),
    unmount: utils.unmount,
  };
}

const lastPayload = (onActionIntent: ReturnType<typeof vi.fn>) => onActionIntent.mock.calls.at(-1)?.[0];

describe("the visual servoing switch on a suspend", () => {
  it("publishes its off payload as a release and reads off", async () => {
    const { onActionIntent, rerender } = renderToggle(SERVO);
    await act(async () => {});
    expect(screen.getByRole("button", { name: "Servo: Servoing" })).toBeInTheDocument();

    rerender(1);

    expect(lastPayload(onActionIntent)).toMatchObject({
      payload: "{data: false}",
      release: true,
      topic: "/ui/visual_servoing/on",
    });
    expect(screen.getByRole("button", { name: "Servo: Off" })).toBeInTheDocument();
  });

  it("switches off when STOP disables it and when it unmounts", async () => {
    const stopped = renderToggle(SERVO);
    await act(async () => {});
    stopped.rerender(0, { disabled: true });
    expect(lastPayload(stopped.onActionIntent)).toMatchObject({ payload: "{data: false}", release: true });
    cleanup();

    const left = renderToggle(SERVO);
    await act(async () => {});
    left.unmount();
    expect(lastPayload(left.onActionIntent)).toMatchObject({ payload: "{data: false}", release: true });
  });

  it("leaves another toggle, such as the gripper, as it was", async () => {
    const { onActionIntent, rerender } = renderToggle(GRIPPER as typeof SERVO);
    await act(async () => {});
    rerender(1);

    expect(onActionIntent).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Gripper: Closed" })).toBeInTheDocument();
  });
});
