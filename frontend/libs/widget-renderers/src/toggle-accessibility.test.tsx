/**
 * @vitest-environment jsdom
 */
import type { ScreenConfig } from "@bloom/api-client";
import { createDefaultWidgetRegistry, renderScreenDescriptors } from "@bloom/widgets";
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { applyCommandStateMessage, resetCommandStateForTests } from "./command-state";
import { renderWidgetDescriptor } from "./index";

function holdOn() {
  act(() =>
    applyCommandStateMessage({
      type: "command_state",
      revision: 1,
      snapshot: {
        "/gripper_controller/commands": {
          value: { data: true },
          source: "measured",
          updated_at: "",
          by: "robot",
          revision: 1,
        },
      },
    }),
  );
}

function renderToggle(settings: Record<string, unknown>) {
  const toggleScreen: ScreenConfig = {
    id: "drive",
    title: "Drive",
    canvas: { preset_id: "native-1280x720", runtime_mode: "fit" },
    widgets: [
      {
        id: "gripper",
        kind: "toggle",
        title: "Gripper",
        layout: { x: 0, y: 0, width: 202, height: 168 },
        settings: {
          topic: "/gripper_controller/commands",
          onPayload: "{data: true}",
          offPayload: "{data: false}",
          ...settings,
        },
      },
    ],
  };
  const [descriptor] = renderScreenDescriptors(toggleScreen, createDefaultWidgetRegistry());
  if (!descriptor) throw new Error("Missing descriptor.");
  render(<div>{renderWidgetDescriptor(descriptor, {})}</div>);
}

describe("toggle accessibility", () => {
  afterEach(() => {
    cleanup();
    resetCommandStateForTests();
  });

  it("names a verb button by its action and describes the commanded state instead of claiming pressed", () => {
    holdOn();
    renderToggle({
      offLabel: "Close gripper",
      onLabel: "Open gripper",
      offStateLabel: "open",
      onStateLabel: "closed",
    });

    const button = screen.getByRole("button", { name: "Gripper: Open gripper, reported by the robot" });
    expect(button).not.toHaveAttribute("aria-pressed");
    expect(button).toHaveAccessibleDescription("commanded: closed");
  });

  it("keeps the pressed state on a button whose words are the state", () => {
    holdOn();
    renderToggle({ offLabel: "Off", onLabel: "On" });

    expect(screen.getByRole("button", { name: "Gripper: On, reported by the robot" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
