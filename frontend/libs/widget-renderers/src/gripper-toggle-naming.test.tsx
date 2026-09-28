/**
 * @vitest-environment jsdom
 */
import type { CommandStateEntry, ScreenConfig } from "@bloom/api-client";
import { createDefaultWidgetRegistry, renderScreenDescriptors, type WidgetActionIntent } from "@bloom/widgets";
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyCommandStateMessage, resetCommandStateForTests } from "./command-state";
import { renderScreenWidgets } from "./index";

// The names scripts/ros-sim-e2e-checks.mjs presses: /^Gripper: Close gripper/ then /^Gripper: Open gripper/.
const CLOSE = /^Gripper: Close gripper/;
const OPEN = /^Gripper: Open gripper/;
const TOPIC = "/gripper_controller/commands";
const ROBOTS = [
  { name: "Explorer", closed: 1.1, open: 0.2 },
  { name: "Kinova", closed: 0.8, open: 0.0 },
];

let revision = 0;
const snapshot: Record<string, CommandStateEntry> = {};
function write(value: unknown, source: CommandStateEntry["source"], by = "me") {
  revision += 1;
  snapshot[TOPIC] = { value, source, by, revision, updated_at: "" };
  act(() => applyCommandStateMessage({ type: "command_state", revision, self: "me", snapshot: { ...snapshot } }));
}

afterEach(() => {
  cleanup();
  resetCommandStateForTests();
  revision = 0;
  delete snapshot[TOPIC];
});

function renderGripper(calibration: { closed: number; open: number }, settings: Record<string, unknown> = {}) {
  const onActionIntent = vi.fn((_: WidgetActionIntent) => ({ accepted: true }));
  const widgets = [
    {
      id: "gripper",
      kind: "toggle",
      title: "Gripper",
      layout: { x: 0, y: 0, width: 300, height: 120 },
      // As the Manager seeds and gripperToggleSettings ship it.
      settings: {
        offLabel: "Close gripper",
        onLabel: "Open gripper",
        initialValue: false,
        topic: TOPIC,
        messageType: "std_msgs/msg/Float64MultiArray",
        onPayload: `{data: [${calibration.closed}]}`,
        offPayload: `{data: [${calibration.open}]}`,
        onStateLabel: "closed",
        offStateLabel: "open",
        ...settings,
      },
    },
  ] as ScreenConfig["widgets"];
  const descriptors = renderScreenDescriptors(
    { id: "s", title: "S", canvas: { preset_id: "native-1280x720", runtime_mode: "fit" }, widgets } as ScreenConfig,
    createDefaultWidgetRegistry(),
  );
  render(<div>{renderScreenWidgets(descriptors, { onActionIntent })}</div>);
  return onActionIntent;
}

const sent = (intent: WidgetActionIntent | undefined) =>
  intent?.type === "topic-publish" ? String(intent.payload) : `not a publish: ${intent?.type}`;

describe.each(ROBOTS)("the $name gripper toggle", (robot) => {
  it("offers both actions while unknown, then the other one once the store holds the commanded value", () => {
    const onActionIntent = renderGripper(robot);

    const close = screen.getByRole("button", { name: CLOSE });
    const open = screen.getByRole("button", { name: OPEN });
    expect(close).toHaveAccessibleName("Gripper: Close gripper");
    expect(open).toHaveAccessibleName("Gripper: Open gripper");
    expect(close).not.toHaveClass("is-on");
    expect(open).not.toHaveClass("is-on");

    fireEvent.click(close);
    expect(sent(onActionIntent.mock.calls[0]?.[0])).toBe(`{data: [${robot.closed}]}`);

    // The backend echoes Bloom's own publish as commanded.
    write({ data: [robot.closed] }, "commanded");
    expect(screen.queryByRole("button", { name: CLOSE })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Gripper: Open gripper, last asked" }));
    expect(sent(onActionIntent.mock.calls[1]?.[0])).toBe(`{data: [${robot.open}]}`);

    write({ data: [robot.open] }, "commanded");
    expect(screen.getByRole("button", { name: "Gripper: Close gripper, last asked" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: OPEN })).toBeNull();
  });

  it("names a measured state at the end, and offers the action that changes it", () => {
    const onActionIntent = renderGripper(robot);
    write({ data: [robot.closed] }, "measured", "robot");
    fireEvent.click(screen.getByRole("button", { name: "Gripper: Open gripper, reported by the robot" }));
    expect(sent(onActionIntent.mock.calls[0]?.[0])).toBe(`{data: [${robot.open}]}`);
  });
});

describe("a gripper toggle whose value the store holds but does not match", () => {
  it("offers both actions, as for unknown", () => {
    // The Widget Lab ships the Explorer's values; the Kinova's finger reports its own.
    renderGripper(ROBOTS[0] as (typeof ROBOTS)[number]);
    write({ data: [0.8] }, "measured", "robot");
    expect(screen.getByRole("button", { name: "Gripper: Close gripper" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gripper: Open gripper" })).toBeInTheDocument();
    expect(screen.getByText("Other value")).toBeInTheDocument();
  });
});

describe("a segmented mode toggle", () => {
  it("offers each mode while unknown, and one switch once known", () => {
    const onActionIntent = vi.fn((_: WidgetActionIntent) => ({ accepted: true }));
    const widgets = [
      {
        id: "shaping",
        kind: "toggle",
        title: "Shaping",
        layout: { x: 0, y: 0, width: 300, height: 90 },
        settings: {
          variant: "mode-segmented",
          offLabel: "Both",
          onLabel: "Jaco",
          topic: "/mode_request",
          messageType: "std_msgs/msg/String",
          onPayload: { data: "geometric/jaco" },
          offPayload: { data: "geometric/both" },
        },
      },
    ] as ScreenConfig["widgets"];
    const descriptors = renderScreenDescriptors(
      { id: "s", title: "S", canvas: { preset_id: "native-1280x720", runtime_mode: "fit" }, widgets } as ScreenConfig,
      createDefaultWidgetRegistry(),
    );
    render(<div>{renderScreenWidgets(descriptors, { onActionIntent })}</div>);

    expect(screen.getByRole("button", { name: "Shaping: Both" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "Shaping: Jaco" }));
    const intent = onActionIntent.mock.calls[0]?.[0];
    expect(intent?.type === "topic-publish" ? intent.payload : null).toEqual({ data: "geometric/jaco" });

    revision += 1;
    act(() =>
      applyCommandStateMessage({
        type: "command_state",
        revision,
        self: "me",
        snapshot: {
          "manager:shaping": { value: "geometric/jaco", source: "commanded", by: "me", revision, updated_at: "" },
        },
      }),
    );
    expect(screen.getByRole("button", { name: "Shaping: Jaco, last asked" })).toHaveAttribute("aria-pressed", "true");
  });
});
