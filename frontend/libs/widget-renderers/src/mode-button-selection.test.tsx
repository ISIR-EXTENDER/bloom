/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CommandLikeWidget } from "./action-renderers";
import type { WidgetControlState } from "./types";

/**
 * The gripper toggle has always shown whether it is on. The mode buttons next
 * to it did not, so "Jaco" and "Both" looked identical whatever had been
 * requested. Both are choices with a current state, so both use one visual
 * language: the accent fill and `aria-pressed`.
 *
 * The manager never reports its mode, so a selected button says "last
 * requested" and nothing stronger.
 */
function renderButton(settings: Record<string, unknown>, controlState?: WidgetControlState) {
  render(
    <CommandLikeWidget
      controlState={controlState}
      descriptor={
        {
          widget: {
            id: "drive-mode-jaco",
            kind: "command-button",
            title: "Jaco",
            layout: { x: 0, y: 0, width: 10, height: 10 },
            settings: { button_label: "Jaco", ...settings },
          },
        } as never
      }
    />,
  );
  return screen.getByRole("button");
}

describe("a latching mode button", () => {
  afterEach(cleanup);

  it("announces itself as pressed when it is the requested mode", () => {
    const button = renderButton({ command: "geometric/jaco" }, { selection: "selected" });

    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.getAttribute("data-selected")).toBe("true");
  });

  it("announces itself as not pressed when another mode was requested", () => {
    const button = renderButton({ command: "geometric/jaco" }, { selection: "unselected" });

    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(button.getAttribute("data-selected")).toBeNull();
  });

  it("says the state is a request, not a confirmation from the robot", () => {
    renderButton(
      { command: "geometric/jaco", action_label: "Request geometric/jaco", show_details: true },
      { selection: "selected" },
    );

    // Folded into the existing detail line: a separate line overflows the
    // heights screen authors set for these buttons.
    expect(screen.getByText(/Last requested/)).toBeTruthy();
    expect(screen.getByRole("button").getAttribute("aria-label")).toBe("Jaco: requested");
  });

  it("still announces the state when runtime details are collapsed", () => {
    renderButton({ command: "geometric/jaco" }, { selection: "selected" });

    expect(screen.queryByText(/Last requested/)).toBeNull();
    expect(screen.getByRole("button").getAttribute("aria-label")).toBe("Jaco: requested");
    expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("true");
  });

  it("stays a plain button when it is not part of a mode set", () => {
    const button = renderButton({ command: "gripper/open" });

    expect(button.getAttribute("aria-pressed")).toBeNull();
    expect(screen.queryByText("Last requested")).toBeNull();
  });

  it("does not take the momentary button's held state away", () => {
    // A momentary button gets no selection, so aria-pressed keeps meaning
    // "held right now" rather than "this is the requested mode".
    const button = renderButton({ command: "geometric/snake", momentary: true });

    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(button.getAttribute("data-momentary")).toBe("true");
  });
});
