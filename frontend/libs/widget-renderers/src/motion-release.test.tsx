/**
 * @vitest-environment jsdom
 */
import type { ScreenConfig } from "@bloom/api-client";
import { createDefaultWidgetRegistry, renderScreenDescriptors } from "@bloom/widgets";
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CommandLikeWidget } from "./action-renderers";
import { GesturePadWidget } from "./gesture-pad-renderer";
import { renderWidgetDescriptor } from "./index";
import type { WidgetRendererProps } from "./types";

class ResizeObserverMock {
  disconnect() {}
  observe() {}
  unobserve() {}
}

globalThis.ResizeObserver = ResizeObserverMock;
Element.prototype.setPointerCapture = vi.fn();
Element.prototype.releasePointerCapture = vi.fn();
Element.prototype.hasPointerCapture = vi.fn(() => false);

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function screenWith(widget: Record<string, unknown>): ScreenConfig {
  return {
    id: "motion",
    title: "Motion",
    canvas: { preset_id: "hd", runtime_mode: "fit" },
    widgets: [{ layout: { x: 0, y: 0, width: 240, height: 320 }, ...widget }],
  } as ScreenConfig;
}

function renderSlider(settings: Record<string, unknown>, onActionIntent = vi.fn()) {
  const [descriptor] = renderScreenDescriptors(
    screenWith({ id: "z", kind: "slider", title: "Z axis", settings: { min: -1, max: 1, step: 0.01, ...settings } }),
    createDefaultWidgetRegistry(),
  );
  if (!descriptor) throw new Error("Missing slider descriptor.");
  render(<div>{renderWidgetDescriptor(descriptor, { onActionIntent })}</div>);
  return { onActionIntent, slider: screen.getByRole("slider", { name: "Z axis" }) };
}

const TELEOP_BINDING = { adapter: "teleop", target: "translation", axis_mapping: { value: { component: "linear_z" } } };

describe("a return-to-center motion slider", () => {
  it("sends rest on release even when the moving value it sent was refused", async () => {
    const onActionIntent = vi.fn((intent: { value: number }) => ({ accepted: intent.value === 0 }));
    const { slider } = renderSlider({ returnToCenter: true, runtime_binding: TELEOP_BINDING }, onActionIntent);

    slider.focus();
    fireEvent.keyDown(slider, { key: "PageUp" });
    expect(slider).toHaveAttribute("aria-valuenow", "0");
    fireEvent.keyUp(slider, { key: "PageUp" });

    expect(onActionIntent).toHaveBeenLastCalledWith(expect.objectContaining({ value: 0 }));
  });

  it.each(["pointerCancel", "lostPointerCapture"] as const)("lets go on %s", (eventName) => {
    const { onActionIntent, slider } = renderSlider({ returnToCenter: true, runtime_binding: TELEOP_BINDING });

    slider.focus();
    fireEvent.keyDown(slider, { key: "PageUp" });
    expect(Number(slider.getAttribute("aria-valuenow"))).toBeGreaterThan(0);
    fireEvent[eventName](slider, { pointerId: 1 });

    expect(onActionIntent).toHaveBeenLastCalledWith(expect.objectContaining({ value: 0 }));
    expect(slider).toHaveAttribute("aria-valuenow", "0");
  });
});

describe("a teleop slider with return to center off", () => {
  it("is a motion axis with a Zero and a latch countdown", () => {
    vi.useFakeTimers();
    const { onActionIntent, slider } = renderSlider({ returnToCenter: false, runtime_binding: TELEOP_BINDING });

    expect(slider.closest("[data-slider-kind]")).toHaveAttribute("data-slider-kind", "motion");
    slider.focus();
    fireEvent.keyDown(slider, { key: "PageUp" });
    fireEvent.keyUp(slider, { key: "PageUp" });
    act(() => {
      vi.advanceTimersByTime(11000);
    });
    expect(screen.getByRole("button", { name: "Keep going" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Zero Z axis" }));
    expect(onActionIntent).toHaveBeenLastCalledWith(expect.objectContaining({ value: 0 }));
    expect(slider).toHaveAttribute("aria-valuenow", "0");
  });
});

function commandDescriptor(settings: Record<string, unknown>) {
  return {
    widget: { id: "cmd", kind: "command-button", title: "Command", settings },
  } as unknown as WidgetRendererProps["descriptor"];
}

describe("an armed Go home", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  const goHome = commandDescriptor({ button_label: "Go home", confirm_press: true, confirm_timeout_seconds: 0 });

  it("disarms when the runtime neutralizes (STOP, suspend)", () => {
    const { rerender } = render(<CommandLikeWidget descriptor={goHome} neutralRevision={0} onActionIntent={vi.fn()} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button")).toHaveAttribute("data-armed", "true");

    rerender(<CommandLikeWidget descriptor={goHome} neutralRevision={1} onActionIntent={vi.fn()} />);

    expect(screen.getByRole("button")).not.toHaveAttribute("data-armed");
  });

  it("disarms when it is disabled", () => {
    const { rerender } = render(<CommandLikeWidget descriptor={goHome} onActionIntent={vi.fn()} />);
    fireEvent.click(screen.getByRole("button"));

    rerender(<CommandLikeWidget controlState={{ disabled: true }} descriptor={goHome} onActionIntent={vi.fn()} />);
    rerender(<CommandLikeWidget controlState={{ disabled: false }} descriptor={goHome} onActionIntent={vi.fn()} />);

    expect(screen.getByRole("button")).not.toHaveAttribute("data-armed");
  });

  it("says its armed hint and selection state in the profile's language", () => {
    render(<CommandLikeWidget descriptor={goHome} language="fr" onActionIntent={vi.fn()} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("reste armé jusqu'au prochain appui")).toBeInTheDocument();
    cleanup();

    render(
      <CommandLikeWidget
        controlState={{ selection: "selected" }}
        descriptor={commandDescriptor({ button_label: "Snake" })}
        language="es"
      />,
    );
    expect(screen.getByRole("button", { name: "Snake: solicitado" })).toBeInTheDocument();
  });
});

describe("a momentary Snake", () => {
  const snake = commandDescriptor({
    button_label: "Hold Snake",
    messageType: "std_msgs/msg/Bool",
    momentary: true,
    payload: "{data: true}",
    releasedPayload: "{data: false}",
    topic: "/snake_control/enable",
  });

  it("stays latched when a dwell or mouse pointer leaves it", () => {
    const onActionIntent = vi.fn();
    render(<CommandLikeWidget descriptor={snake} onActionIntent={onActionIntent} />);
    const button = screen.getByRole("button");

    fireEvent.click(button, { detail: 0 });
    fireEvent.pointerLeave(button, { pointerId: 1 });
    fireEvent.pointerUp(button, { pointerId: 1 });

    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(onActionIntent.mock.calls.map(([intent]) => intent.payload)).toEqual(["{data: true}"]);
  });

  it("ends a pointer hold only for the pointer that began it", () => {
    const onActionIntent = vi.fn();
    render(<CommandLikeWidget descriptor={snake} onActionIntent={onActionIntent} />);
    const button = screen.getByRole("button");

    fireEvent.pointerDown(button, { pointerId: 1 });
    fireEvent.pointerLeave(button, { pointerId: 2 });
    fireEvent.pointerUp(button, { pointerId: 2 });
    expect(button).toHaveAttribute("aria-pressed", "true");

    fireEvent.pointerUp(button, { pointerId: 1 });
    expect(onActionIntent.mock.calls.map(([intent]) => intent.payload)).toEqual(["{data: true}", "{data: false}"]);
  });
});

describe("the gesture pad", () => {
  function renderPad() {
    const onActionIntent = vi.fn();
    const [descriptor] = renderScreenDescriptors(
      screenWith({
        id: "throw",
        kind: "gesture-pad",
        title: "Throw",
        settings: { topic: "/ui/throw", messageType: "std_msgs/msg/String" },
      }),
      createDefaultWidgetRegistry(),
    );
    if (descriptor?.status !== "resolved") throw new Error("Missing gesture descriptor.");
    render(<GesturePadWidget descriptor={descriptor} onActionIntent={onActionIntent} />);
    return { onActionIntent, pad: screen.getByRole("button", { name: /choose trajectory gesture/ }) };
  }

  it("sends nothing for an arrow key-up whose key-down happened elsewhere", () => {
    const { onActionIntent, pad } = renderPad();

    fireEvent.keyUp(pad, { key: "ArrowUp" });
    expect(onActionIntent).not.toHaveBeenCalled();

    fireEvent.keyDown(pad, { key: "ArrowUp" });
    fireEvent.keyUp(pad, { key: "ArrowUp" });
    expect(onActionIntent).toHaveBeenCalledTimes(1);
  });

  it("drops a drag whose pointer capture was taken away", () => {
    const { onActionIntent, pad } = renderPad();

    fireEvent.pointerDown(pad, { pointerId: 1, buttons: 1 });
    fireEvent.lostPointerCapture(pad, { pointerId: 1 });
    fireEvent.pointerUp(pad, { pointerId: 1 });

    expect(onActionIntent).not.toHaveBeenCalled();
  });
});
