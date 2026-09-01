/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CommandLikeWidget } from "./action-renderers";
import type { WidgetRendererProps } from "./types";

/**
 * A `cartesian_manager` named joint target is dispatched once and the manager
 * reports no progress, so an accidental press is a moving arm with nothing to
 * interrupt it. Confirm-press exists for exactly that case.
 */
function renderButton(settings: Record<string, unknown>, onActionIntent = vi.fn()) {
  const descriptor = {
    widget: {
      id: "go-home",
      kind: "command-button",
      title: "Home",
      settings: { button_label: "Go home", ...settings },
    },
  } as unknown as WidgetRendererProps["descriptor"];

  render(<CommandLikeWidget descriptor={descriptor} onActionIntent={onActionIntent} />);
  return onActionIntent;
}

describe("command button confirm press", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("dispatches on a single press when confirmation is off", () => {
    const onActionIntent = renderButton({ confirm_press: false });

    fireEvent.click(screen.getByRole("button"));

    expect(onActionIntent).toHaveBeenCalledTimes(1);
  });

  it("does not dispatch on the first press when confirmation is on", () => {
    const onActionIntent = renderButton({ confirm_press: true });

    fireEvent.click(screen.getByRole("button"));

    expect(onActionIntent).not.toHaveBeenCalled();
    expect(screen.getByRole("button").getAttribute("data-armed")).toBe("true");
  });

  it("dispatches on the second press", () => {
    const onActionIntent = renderButton({ confirm_press: true });
    const button = screen.getByRole("button");

    fireEvent.click(button);
    fireEvent.click(button);

    expect(onActionIntent).toHaveBeenCalledTimes(1);
  });

  it("shows the confirmation label while armed", () => {
    renderButton({ confirm_press: true, confirm_label: "Press again to move" });

    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByRole("button").textContent).toBe("Press again to move");
  });

  it("disarms itself after the timeout so a stale arm cannot be completed later", () => {
    const onActionIntent = renderButton({ confirm_press: true, confirm_timeout_seconds: 5 });
    const button = screen.getByRole("button");

    fireEvent.click(button);
    expect(button.getAttribute("data-armed")).toBe("true");

    act(() => {
      vi.advanceTimersByTime(5001);
    });
    expect(button.getAttribute("data-armed")).toBeNull();

    // The next press arms again rather than dispatching.
    fireEvent.click(button);
    expect(onActionIntent).not.toHaveBeenCalled();
  });

  it("stays armed when the timeout is zero", () => {
    renderButton({ confirm_press: true, confirm_timeout_seconds: 0 });
    const button = screen.getByRole("button");

    fireEvent.click(button);
    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(button.getAttribute("data-armed")).toBe("true");
  });
});
