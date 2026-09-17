/**
 * @vitest-environment jsdom
 */
import type { ScreenConfig } from "@bloom/api-client";
import { createDefaultWidgetRegistry, renderScreenDescriptors } from "@bloom/widgets";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { renderWidgetDescriptor } from "./index";

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
        settings: { topic: "/gripper_controller/commands", ...settings },
      },
    ],
  };
  const [descriptor] = renderScreenDescriptors(toggleScreen, createDefaultWidgetRegistry());
  if (!descriptor) throw new Error("Missing descriptor.");
  render(<div>{renderWidgetDescriptor(descriptor, {})}</div>);
}

describe("toggle accessibility", () => {
  afterEach(cleanup);

  it("names a verb button by its action and describes the commanded state instead of claiming pressed", () => {
    renderToggle({
      offLabel: "Close gripper",
      onLabel: "Open gripper",
      offStateLabel: "open",
      onStateLabel: "closed",
      initialValue: true,
    });

    const button = screen.getByRole("button", { name: "Gripper: Open gripper" });
    expect(button).not.toHaveAttribute("aria-pressed");
    expect(button).toHaveAccessibleDescription("commanded: closed");
  });

  it("keeps the pressed state on a button whose words are the state", () => {
    renderToggle({ offLabel: "Off", onLabel: "On", initialValue: true });

    expect(screen.getByRole("button", { name: "Gripper: On" })).toHaveAttribute("aria-pressed", "true");
  });
});
