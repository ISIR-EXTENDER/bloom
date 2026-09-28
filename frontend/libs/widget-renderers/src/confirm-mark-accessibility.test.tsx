/**
 * @vitest-environment jsdom
 */
import type { ScreenConfig } from "@bloom/api-client";
import { createDefaultWidgetRegistry, renderScreenDescriptors, type WidgetActionIntent } from "@bloom/widgets";
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CommandLikeWidget } from "./action-renderers";
import { resetDesiredStates } from "./desired-state";
import { renderWidgetDescriptor } from "./index";
import type { WidgetActionOutcome } from "./types";

type Handler = (intent: WidgetActionIntent) => WidgetActionOutcome | Promise<WidgetActionOutcome>;

const settle = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

const LATE = "Robot has not confirmed — STOP if in doubt";

function gripper(onActionIntent: Handler) {
  const [descriptor] = renderScreenDescriptors(
    {
      id: "drive",
      title: "Drive",
      canvas: { preset_id: "native-1280x720", runtime_mode: "fit" },
      widgets: [
        {
          id: "gripper",
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
          },
        },
      ],
    } as ScreenConfig,
    createDefaultWidgetRegistry(),
  );
  if (!descriptor) throw new Error("Missing toggle descriptor.");
  return <div>{renderWidgetDescriptor(descriptor, { neutralRevision: 0, onActionIntent })}</div>;
}

function modeButton(onActionIntent: Handler) {
  return (
    <CommandLikeWidget
      descriptor={
        {
          widget: {
            id: "jaco",
            kind: "command-button",
            title: "jaco",
            layout: { x: 0, y: 0, width: 10, height: 10 },
            settings: {
              button_label: "Jaco",
              messageType: "std_msgs/msg/String",
              payload: { data: "geometric/jaco" },
              topic: "/mode_request",
            },
          },
        } as never
      }
      onActionIntent={onActionIntent}
    />
  );
}

describe("the unconfirmed mark reaches a screen reader", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    resetDesiredStates();
    vi.useRealTimers();
  });

  it("describes a toggle with the late STOP advice and stops being busy once marked", async () => {
    render(gripper(vi.fn(() => new Promise<WidgetActionOutcome>(() => {}))));
    const button = screen.getByRole("button");

    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-busy", "true");
    await settle(4000);

    expect(button).toHaveAccessibleDescription(LATE);
    expect(button).not.toHaveAttribute("aria-busy", "true");
  });

  it("describes a command button with the late STOP advice and is not busy through the retries", async () => {
    render(modeButton(vi.fn(() => Promise.reject(new Error("timed out")))));
    const button = screen.getByRole("button");

    fireEvent.click(button);
    await settle(4500);

    expect(button).toHaveAccessibleDescription(LATE);
    expect(button).not.toHaveAttribute("aria-busy", "true");
  });
});
