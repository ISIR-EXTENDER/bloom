/**
 * @vitest-environment jsdom
 */
import type { ScreenConfig } from "@bloom/api-client";
import { createDefaultWidgetRegistry, createWidgetRegistry, renderScreenDescriptors } from "@bloom/widgets";
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatEchoMessage } from "./debug-renderers";
import { GaugeWidget } from "./display-renderers";
import {
  createWidgetRendererRegistry,
  renderScreenWidgets,
  renderWidgetDescriptor,
  resolveJoystickControlSize,
  type WidgetRendererRegistration,
} from "./index";

class ResizeObserverMock {
  disconnect() {}
  observe() {}
  unobserve() {}
}

globalThis.ResizeObserver = ResizeObserverMock;
Element.prototype.setPointerCapture = vi.fn();
Element.prototype.releasePointerCapture = vi.fn();

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("widget renderer registry", () => {
  it("rejects duplicate renderer registrations", () => {
    const registrations: WidgetRendererRegistration[] = [
      { kind: "label", render: () => "Label A" },
      { kind: "label", render: () => "Label B" },
    ];

    expect(() => createWidgetRendererRegistry(registrations)).toThrow('Duplicate widget renderer for kind "label".');
  });

  it("renders resolved widgets through the registered React component", () => {
    const descriptor = renderScreenDescriptors(sampleScreen, createDefaultWidgetRegistry())[0];
    if (!descriptor) throw new Error("Missing sample descriptor.");

    render(<div>{renderWidgetDescriptor(descriptor)}</div>);

    expect(screen.getByText("Hello Bloom")).toBeVisible();
    expect(screen.queryByText("Label")).not.toBeInTheDocument();
  });

  it("renders unknown widgets through a safe fallback", () => {
    const descriptor = renderScreenDescriptors(sampleScreen, createWidgetRendererRegistryCompatibleWithNoWidgets())[0];
    if (!descriptor) throw new Error("Missing sample descriptor.");

    render(<div>{renderWidgetDescriptor(descriptor)}</div>);

    expect(screen.getByText("Hello")).toBeVisible();
    expect(screen.getByText('No widget definition registered for kind "label".')).toBeVisible();
  });

  it("renders all screen widgets with layout frames", () => {
    const descriptors = renderScreenDescriptors(sampleScreen, createDefaultWidgetRegistry());

    const { container } = render(<div>{renderScreenWidgets(descriptors)}</div>);

    expect(screen.getByText("Hello Bloom")).toBeVisible();
    expect(container.querySelectorAll("[data-screen-id='main']")).toHaveLength(2);
    expect(container.querySelector("[aria-label='Digital output Toggle']")).toBeInTheDocument();
  });

  it("keeps an unavailable runtime widget visible, inert, and explained", () => {
    const descriptors = renderScreenDescriptors(sampleScreen, createDefaultWidgetRegistry());
    const onActionIntent = vi.fn();
    const { container } = render(
      <div>
        {renderScreenWidgets(descriptors, {
          controlStateByWidgetId: {
            "ros-toggle": {
              disabled: true,
              disabledReason: "No ROS publisher is connected, so commands go nowhere.",
              unavailable: true,
            },
          },
          onActionIntent,
        })}
      </div>,
    );

    const framedWidget = container.querySelector<HTMLElement>("[data-widget-kind='toggle']");
    const toggle = framedWidget?.querySelector<HTMLButtonElement>("button");
    expect(framedWidget).toHaveAttribute("data-runtime-unavailable", "true");
    expect(framedWidget?.querySelector(".bloom-runtime-widget-content")).toHaveAttribute("inert");
    expect(screen.getByRole("note")).toHaveTextContent(
      "Digital output unavailableNo ROS publisher is connected, so commands go nowhere.",
    );
    expect(toggle).toBeInTheDocument();
    if (!toggle) {
      throw new Error("Unavailable toggle disappeared.");
    }
    fireEvent.click(toggle);
    expect(onActionIntent).not.toHaveBeenCalled();
  });

  it("renders labels as configured text instead of placeholder metadata", () => {
    const descriptors = renderScreenDescriptors(centeredLabelScreen, createDefaultWidgetRegistry());
    const descriptor = descriptors[0];
    if (!descriptor) throw new Error("Missing centered label descriptor.");

    const { container } = render(<div>{renderWidgetDescriptor(descriptor)}</div>);

    expect(screen.getByText("Ready for teleop")).toBeVisible();
    expect(screen.queryByText("Label")).not.toBeInTheDocument();
    expect(container.querySelector(".bloom-label-widget")).toHaveAttribute("data-align", "center");
    expect(container.querySelector(".bloom-label-widget")).toHaveStyle({ fontSize: "28px" });
  });

  it("emits value-change intents from interactive sliders", async () => {
    const descriptor = renderScreenDescriptors(sliderScreen, createDefaultWidgetRegistry())[0];
    if (!descriptor) throw new Error("Missing slider descriptor.");
    const onActionIntent = vi.fn();
    const user = userEvent.setup();

    render(<div>{renderWidgetDescriptor(descriptor, { onActionIntent })}</div>);

    expect(screen.getByText("0.80 m/s")).toHaveClass("bloom-widget-readout");
    screen.getByRole("slider", { name: "Speed" }).focus();
    await user.keyboard("{ArrowRight}");

    expect(onActionIntent).toHaveBeenCalledWith({
      type: "value-change",
      widgetId: "speed",
      widgetKind: "slider",
      value: expect.any(Number),
    });
  });

  it("returns teleop sliders to center when configured", async () => {
    const descriptor = renderScreenDescriptors(returnToCenterSliderScreen, createDefaultWidgetRegistry())[0];
    if (!descriptor) throw new Error("Missing slider descriptor.");
    const onActionIntent = vi.fn();
    const user = userEvent.setup();

    render(<div>{renderWidgetDescriptor(descriptor, { onActionIntent })}</div>);

    const slider = screen.getByRole("slider", { name: "Teleop X" });
    expect(slider.closest(".bloom-axis-slider")).toHaveAttribute("data-return-to-center", "true");
    slider.focus();
    await user.keyboard("{ArrowRight}");
    fireEvent.blur(slider);

    expect(onActionIntent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: "value-change",
        value: 0,
        widgetId: "teleop-x",
        widgetKind: "slider",
      }),
    );
    expect(document.querySelector(".bloom-slider-widget output.sr-only")).toHaveTextContent("0.00");
  });

  it("holds a keyboard nudge on a return-to-center slider only while the key is down", () => {
    const descriptor = renderScreenDescriptors(returnToCenterSliderScreen, createDefaultWidgetRegistry())[0];
    if (!descriptor) throw new Error("Missing slider descriptor.");
    const onActionIntent = vi.fn();

    render(<div>{renderWidgetDescriptor(descriptor, { onActionIntent })}</div>);

    const slider = screen.getByRole("slider", { name: "Teleop X" });
    slider.focus();
    fireEvent.keyDown(slider, { key: "PageUp" });
    fireEvent.keyDown(slider, { key: "PageUp" });
    expect(onActionIntent.mock.calls.map(([intent]) => intent.value).every((value) => value > 0)).toBe(true);
    expect(Number(slider.getAttribute("aria-valuenow"))).toBeGreaterThan(0);

    fireEvent.keyUp(slider, { key: "PageUp" });

    expect(onActionIntent).toHaveBeenLastCalledWith(expect.objectContaining({ value: 0 }));
    expect(slider).toHaveAttribute("aria-valuenow", "0");
  });

  it("never jumps a return-to-center slider to full scale from Home or End", () => {
    const descriptor = renderScreenDescriptors(returnToCenterSliderScreen, createDefaultWidgetRegistry())[0];
    if (!descriptor) throw new Error("Missing slider descriptor.");
    const onActionIntent = vi.fn();

    render(<div>{renderWidgetDescriptor(descriptor, { onActionIntent })}</div>);

    const slider = screen.getByRole("slider", { name: "Teleop X" });
    slider.focus();
    fireEvent.keyDown(slider, { key: "End" });
    fireEvent.keyUp(slider, { key: "End" });
    expect(onActionIntent).not.toHaveBeenCalled();

    fireEvent.keyDown(slider, { key: "ArrowRight" });
    fireEvent.keyDown(slider, { key: "Home" });

    expect(onActionIntent).toHaveBeenLastCalledWith(expect.objectContaining({ value: 0 }));
    expect(onActionIntent.mock.calls.every(([intent]) => Math.abs(intent.value) < 1)).toBe(true);
  });

  it("honours the snake_case slider keys configs in the wild carry", async () => {
    const descriptor = renderScreenDescriptors(legacyKeysSliderScreen, createDefaultWidgetRegistry())[0];
    if (!descriptor) throw new Error("Missing slider descriptor.");
    const onActionIntent = vi.fn();
    const user = userEvent.setup();

    render(<div>{renderWidgetDescriptor(descriptor, { onActionIntent })}</div>);

    const slider = screen.getByRole("slider", { name: "Z" });
    expect(slider.closest(".bloom-axis-slider")).toHaveAttribute("data-return-to-center", "true");
    expect(slider.closest(".bloom-axis-slider")).toHaveAttribute("data-orientation", "horizontal");
    slider.focus();
    await user.keyboard("{ArrowRight}");
    fireEvent.blur(slider);

    expect(onActionIntent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: "value-change",
        value: 0,
        widgetId: "drive-z",
      }),
    );
  });

  it("shows slider runtime details only when requested", () => {
    const descriptor = renderScreenDescriptors(sliderDebugScreen, createDefaultWidgetRegistry())[0];
    if (!descriptor) throw new Error("Missing slider descriptor.");

    render(<div>{renderWidgetDescriptor(descriptor)}</div>);

    expect(screen.getByText("0.00 → 2.00 · linear")).toBeVisible();
    expect(screen.getByText("0.80 m/s")).toBeVisible();
    expect(screen.getByText("Teleoperation gain")).toHaveClass("bloom-control-intent");
  });

  it("keeps compact slider intent accessible without taking layout space", () => {
    const descriptor = renderScreenDescriptors(sliderScreen, createDefaultWidgetRegistry())[0];
    if (!descriptor) throw new Error("Missing slider descriptor.");

    render(<div>{renderWidgetDescriptor(descriptor)}</div>);

    expect(screen.getByText("0.80 m/s")).toBeVisible();
    expect(screen.getByText("Teleoperation gain")).toHaveClass("sr-only");
  });

  it("emits command intents from command buttons", async () => {
    const descriptor = renderScreenDescriptors(commandButtonScreen, createDefaultWidgetRegistry())[0];
    if (!descriptor) throw new Error("Missing command button descriptor.");
    const onActionIntent = vi.fn();
    const user = userEvent.setup();

    render(<div>{renderWidgetDescriptor(descriptor, { onActionIntent })}</div>);

    await user.click(screen.getByRole("button", { name: "Activate throw" }));

    expect(onActionIntent).toHaveBeenCalledWith({
      command: "activate_throw",
      type: "command",
      widgetId: "activate-throw",
      widgetKind: "command-button",
    });
  });

  it("emits one press and one release for momentary command buttons", () => {
    const descriptor = renderScreenDescriptors(momentaryButtonScreen, createDefaultWidgetRegistry())[0];
    if (!descriptor) throw new Error("Missing momentary button descriptor.");
    const onActionIntent = vi.fn();

    render(<div>{renderWidgetDescriptor(descriptor, { onActionIntent })}</div>);

    const button = screen.getByRole("button", { name: "Hold Snake" });
    expect(button).toHaveAttribute("data-momentary", "true");
    expect(screen.queryByText("momentary_ros_message")).not.toBeInTheDocument();
    fireEvent.pointerDown(button, { pointerId: 1 });
    fireEvent.pointerCancel(button, { pointerId: 1 });
    fireEvent.pointerUp(button, { pointerId: 1 });

    expect(onActionIntent).toHaveBeenCalledTimes(2);
    expect(onActionIntent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        messageType: "std_msgs/msg/Bool",
        payload: "{data: true}",
        topic: "/snake_control/enable",
        type: "topic-publish",
      }),
    );
    expect(onActionIntent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        messageType: "std_msgs/msg/Bool",
        payload: "{data: false}",
        topic: "/snake_control/enable",
        type: "topic-publish",
      }),
    );
  });

  it("latches a momentary button for switch, dwell and keyboard activation", () => {
    // Scanning, dwell and the keyboard all arrive as click(): a pointer-only
    // hold would leave Hold Snake unreachable for the people who need it most.
    const descriptor = renderScreenDescriptors(momentaryButtonScreen, createDefaultWidgetRegistry())[0];
    if (!descriptor) throw new Error("Missing momentary button descriptor.");
    const onActionIntent = vi.fn();

    render(<div>{renderWidgetDescriptor(descriptor, { onActionIntent })}</div>);

    const button = screen.getByRole("button", { name: "Hold Snake" });
    fireEvent.click(button, { detail: 0 });
    expect(button).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(button, { detail: 0 });
    expect(button).toHaveAttribute("aria-pressed", "false");

    expect(onActionIntent.mock.calls.map(([intent]) => intent.payload)).toEqual(["{data: true}", "{data: false}"]);
  });

  it("releases a latched momentary button after the expiry even while re-rendering", () => {
    vi.useFakeTimers();
    try {
      const descriptor = renderScreenDescriptors(momentaryButtonScreen, createDefaultWidgetRegistry())[0];
      if (!descriptor) throw new Error("Missing momentary button descriptor.");
      const onActionIntent = vi.fn();
      const { rerender } = render(<div>{renderWidgetDescriptor(descriptor, { onActionIntent })}</div>);

      fireEvent.click(screen.getByRole("button", { name: "Hold Snake" }), { detail: 0 });
      for (let second = 0; second < 16; second += 1) {
        act(() => {
          vi.advanceTimersByTime(1000);
        });
        rerender(<div>{renderWidgetDescriptor(descriptor, { onActionIntent })}</div>);
      }

      expect(onActionIntent.mock.calls.map(([intent]) => intent.payload)).toEqual(["{data: true}", "{data: false}"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("releases a latched momentary button when it unmounts", () => {
    // Opening Settings or changing screen unmounts Hold snake. Without a
    // release, the manager stays in snake mode after the button is gone.
    const descriptor = renderScreenDescriptors(momentaryButtonScreen, createDefaultWidgetRegistry())[0];
    if (!descriptor) throw new Error("Missing momentary button descriptor.");
    const onActionIntent = vi.fn();
    const { unmount } = render(<div>{renderWidgetDescriptor(descriptor, { onActionIntent })}</div>);

    fireEvent.click(screen.getByRole("button", { name: "Hold Snake" }), { detail: 0 });
    unmount();

    expect(onActionIntent.mock.calls.map(([intent]) => [intent.payload, intent.release])).toEqual([
      ["{data: true}", undefined],
      ["{data: false}", true],
    ]);
  });

  it("releases a held momentary button when it becomes disabled mid-hold", () => {
    const descriptor = renderScreenDescriptors(momentaryButtonScreen, createDefaultWidgetRegistry())[0];
    if (!descriptor) throw new Error("Missing momentary button descriptor.");
    const onActionIntent = vi.fn();
    const { rerender } = render(<div>{renderWidgetDescriptor(descriptor, { onActionIntent })}</div>);

    fireEvent.pointerDown(screen.getByRole("button", { name: "Hold Snake" }), { pointerId: 1 });
    rerender(
      <div>
        {renderWidgetDescriptor(descriptor, {
          controlStateByWidgetId: { "snake-hold": { disabled: true, disabledReason: "No subscriber." } },
          onActionIntent,
        })}
      </div>,
    );

    expect(onActionIntent.mock.calls.map(([intent]) => intent.payload)).toEqual(["{data: true}", "{data: false}"]);
    expect(screen.getByRole("button", { name: /Hold Snake/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("releases a latched momentary button when the runtime neutralizes teleop", () => {
    const descriptor = renderScreenDescriptors(momentaryButtonScreen, createDefaultWidgetRegistry())[0];
    if (!descriptor) throw new Error("Missing momentary button descriptor.");
    const onActionIntent = vi.fn();
    const { rerender } = render(
      <div>{renderWidgetDescriptor(descriptor, { neutralRevision: 0, onActionIntent })}</div>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Hold Snake" }), { detail: 0 });
    rerender(<div>{renderWidgetDescriptor(descriptor, { neutralRevision: 1, onActionIntent })}</div>);

    expect(onActionIntent.mock.calls.map(([intent]) => intent.payload)).toEqual(["{data: true}", "{data: false}"]);
  });

  it("does not publish a release for a button that was never held", () => {
    const descriptor = renderScreenDescriptors(momentaryButtonScreen, createDefaultWidgetRegistry())[0];
    if (!descriptor) throw new Error("Missing momentary button descriptor.");
    const onActionIntent = vi.fn();
    const { unmount } = render(<div>{renderWidgetDescriptor(descriptor, { onActionIntent })}</div>);

    unmount();

    expect(onActionIntent).not.toHaveBeenCalled();
  });

  it("leaves a pointer hold alone when its click follows the release", () => {
    const descriptor = renderScreenDescriptors(momentaryButtonScreen, createDefaultWidgetRegistry())[0];
    if (!descriptor) throw new Error("Missing momentary button descriptor.");
    const onActionIntent = vi.fn();

    render(<div>{renderWidgetDescriptor(descriptor, { onActionIntent })}</div>);

    const button = screen.getByRole("button", { name: "Hold Snake" });
    fireEvent.pointerDown(button, { pointerId: 1 });
    fireEvent.pointerUp(button, { pointerId: 1 });
    fireEvent.click(button, { detail: 1 });

    expect(onActionIntent.mock.calls.map(([intent]) => intent.payload)).toEqual(["{data: true}", "{data: false}"]);
  });

  it("emits topic publish intents from toggles", async () => {
    const descriptor = renderScreenDescriptors(toggleScreen, createDefaultWidgetRegistry())[0];
    if (!descriptor) throw new Error("Missing toggle descriptor.");
    const onActionIntent = vi.fn();
    const user = userEvent.setup();

    render(<div>{renderWidgetDescriptor(descriptor, { onActionIntent })}</div>);

    await user.click(screen.getByRole("button", { name: "Digital output: Inactive" }));

    expect(onActionIntent).toHaveBeenCalledWith({
      nextState: "on",
      payload: "{data: [13, 1]}",
      payloadText: "{data: [13, 1]}",
      topic: "/ui/ros_toggle",
      type: "topic-publish",
      widgetId: "ros-toggle",
      widgetKind: "toggle",
    });
    expect(await screen.findByRole("button", { name: "Digital output: Active" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("keeps toggles pending until the action is acknowledged", async () => {
    const descriptor = renderScreenDescriptors(toggleScreen, createDefaultWidgetRegistry())[0];
    if (!descriptor) throw new Error("Missing toggle descriptor.");
    let acknowledge: ((outcome: { accepted: boolean }) => void) | undefined;
    const onActionIntent = vi.fn(
      () =>
        new Promise<{ accepted: boolean }>((resolve) => {
          acknowledge = resolve;
        }),
    );
    const user = userEvent.setup();

    render(<div>{renderWidgetDescriptor(descriptor, { onActionIntent })}</div>);

    await user.click(screen.getByRole("button", { name: "Digital output: Inactive" }));

    const pendingToggle = screen.getByRole("button", { name: "Digital output: Inactive" });
    expect(pendingToggle).toBeDisabled();
    expect(pendingToggle).toHaveAttribute("aria-busy", "true");

    acknowledge?.({ accepted: true });

    expect(await screen.findByRole("button", { name: "Digital output: Active" })).toBeEnabled();
  });

  it("keeps the previous toggle state when the action is rejected", async () => {
    const descriptor = renderScreenDescriptors(toggleScreen, createDefaultWidgetRegistry())[0];
    if (!descriptor) throw new Error("Missing toggle descriptor.");
    const onActionIntent = vi.fn(async () => ({ accepted: false, detail: "Not sent." }));
    const user = userEvent.setup();

    render(<div>{renderWidgetDescriptor(descriptor, { onActionIntent })}</div>);

    await user.click(screen.getByRole("button", { name: "Digital output: Inactive" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Digital output: Inactive" })).toHaveAttribute("aria-busy", "false"),
    );
    expect(screen.getByRole("button", { name: "Digital output: Inactive" })).toHaveAttribute("aria-pressed", "false");
  });

  it("emits vector value-change intents from interactive joysticks", async () => {
    const descriptor = renderScreenDescriptors(joystickScreen, createDefaultWidgetRegistry())[0];
    if (!descriptor) throw new Error("Missing joystick descriptor.");
    const onActionIntent = vi.fn();

    render(<div>{renderWidgetDescriptor(descriptor, { onActionIntent })}</div>);

    const joystickZone = getJoystickZone();
    fireEvent.pointerDown(joystickZone, { clientX: 150, clientY: 150, pointerId: 1 });
    fireEvent.pointerMove(joystickZone, { clientX: 175, clientY: 162.5, pointerId: 1 });

    expect(onActionIntent).toHaveBeenCalledWith({
      binding: "joy",
      modeId: "both",
      publishRateHz: 30,
      runtimeBinding: {
        adapter: "teleop",
        target: "both",
        value_mapping: {
          mode: 3,
          target_topic: "/joystick_cartesian_command",
        },
      },
      type: "value-change",
      value: { x: 0.5, y: -0.25 },
      widgetId: "translation",
      widgetKind: "joystick",
      zeroOnRelease: true,
    });
    // The live region announces where the pad came to rest, not every sample of
    // a 30 Hz stream.
    const announcement = document.querySelector("output.sr-only");
    expect(announcement?.textContent).toBe("x 0.00 y 0.00");
    await waitFor(() => expect(announcement?.textContent).toBe("x 0.50 y -0.25"));
  });

  it("shows joystick runtime details only when requested", () => {
    const descriptor = renderScreenDescriptors(joystickDebugScreen, createDefaultWidgetRegistry())[0];
    if (!descriptor) throw new Error("Missing joystick descriptor.");

    render(<div>{renderWidgetDescriptor(descriptor)}</div>);

    // "both" is the mode, and appears once, in the header. It used to appear a
    // second time in the strip's target slot, where a topic belongs.
    expect(screen.getAllByText("both")).toHaveLength(1);
    expect(screen.getByText("translation / translation")).toBeVisible();
    expect(screen.getByText("30 Hz")).toBeVisible();
    expect(screen.getByText("/joystick_cartesian_command")).toBeVisible();
    expect(document.querySelector(".bloom-widget-head .bloom-widget-readout")).toHaveTextContent("x +0.00 y +0.00");
  });

  it("emits gesture value-change intents from trajectory pads", () => {
    const descriptor = renderScreenDescriptors(gesturePadScreen, createDefaultWidgetRegistry())[0];
    if (!descriptor) throw new Error("Missing gesture pad descriptor.");
    const onActionIntent = vi.fn();

    render(<div>{renderWidgetDescriptor(descriptor, { onActionIntent })}</div>);

    const gesturePad = screen.getByRole("button", { name: "Throw gesture: choose trajectory gesture" });
    vi.spyOn(gesturePad, "getBoundingClientRect").mockReturnValue({
      bottom: 100,
      height: 100,
      left: 0,
      right: 200,
      toJSON: () => {},
      top: 0,
      width: 200,
      x: 0,
      y: 0,
    } as DOMRect);

    fireEvent.pointerDown(gesturePad, { clientX: 100, clientY: 25, pointerId: 1 });

    expect(onActionIntent).toHaveBeenCalledWith({
      binding: "petanque.throw.preview",
      messageType: "std_msgs/msg/String",
      topic: "/petanque/throw/gesture",
      type: "value-change",
      value: { angleDegrees: 90, power: 0.75 },
      widgetId: "throw-gesture",
      widgetKind: "gesture-pad",
    });
    expect(screen.getByText("Drag to set trajectory")).toBeVisible();
    expect(screen.getByText("Angle 90 deg · Power 75%")).toHaveClass("sr-only");
  });

  it("supports keyboard gesture adjustments for accessible trajectory pads", async () => {
    const descriptor = renderScreenDescriptors(gesturePadScreen, createDefaultWidgetRegistry())[0];
    if (!descriptor) throw new Error("Missing gesture pad descriptor.");
    const onActionIntent = vi.fn();
    const user = userEvent.setup();

    render(<div>{renderWidgetDescriptor(descriptor, { onActionIntent })}</div>);

    screen.getByRole("button", { name: "Throw gesture: choose trajectory gesture" }).focus();
    await user.keyboard("{ArrowRight}{ArrowUp}");

    expect(onActionIntent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: "value-change",
        value: { angleDegrees: 50, power: 0.55 },
        widgetId: "throw-gesture",
        widgetKind: "gesture-pad",
      }),
    );
  });

  it("keeps publishing joystick vectors while held and zeros on release", async () => {
    const descriptor = renderScreenDescriptors(joystickScreen, createDefaultWidgetRegistry())[0];
    if (!descriptor) throw new Error("Missing joystick descriptor.");
    const onActionIntent = vi.fn();

    render(<div>{renderWidgetDescriptor(descriptor, { onActionIntent })}</div>);

    const joystickZone = getJoystickZone();
    fireEvent.pointerDown(joystickZone, { clientX: 150, clientY: 150, pointerId: 1 });
    fireEvent.pointerMove(joystickZone, { clientX: 150, clientY: 125, pointerId: 1 });
    fireEvent.pointerMove(joystickZone, { clientX: 162.5, clientY: 125, pointerId: 1 });

    await waitFor(() => expect(onActionIntent.mock.calls.length).toBeGreaterThanOrEqual(2), { timeout: 250 });
    expect(onActionIntent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: "value-change",
        value: { x: 0.25, y: 0.5 },
      }),
    );

    fireEvent.pointerUp(joystickZone, { clientX: 162.5, clientY: 125, pointerId: 1 });

    expect(onActionIntent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: "value-change",
        value: { x: 0, y: 0 },
      }),
    );
  });

  it("moves the joystick knob across the usable circular travel", () => {
    const descriptor = renderScreenDescriptors(joystickScreen, createDefaultWidgetRegistry())[0];
    if (!descriptor) throw new Error("Missing joystick descriptor.");

    render(<div>{renderWidgetDescriptor(descriptor)}</div>);

    const joystickZone = getJoystickZone();
    fireEvent.pointerDown(joystickZone, { clientX: 200, clientY: 150, pointerId: 1 });

    // Pad recipe: knob S × 0.26, full deflection travels 37% of the pad from centre.
    const knob = document.querySelector<HTMLElement>(".bloom-joystick-knob");
    expect(knob).toHaveStyle({ width: "56px", height: "56px", left: "87%", top: "50%" });
  });

  it("draws a square pad inside a card that is not square (pad recipe rule 3)", () => {
    // The shipped operator card: 314×346, and the pad inside it is still a square.
    const oblong = {
      ...joystickScreen,
      widgets: [{ ...joystickScreen.widgets[0], layout: { x: 0, y: 0, width: 314, height: 346 } }],
    } as ScreenConfig;
    const descriptor = renderScreenDescriptors(oblong, createDefaultWidgetRegistry())[0];
    if (!descriptor) throw new Error("Missing joystick descriptor.");

    render(<div>{renderWidgetDescriptor(descriptor)}</div>);

    const edge = `${resolveJoystickControlSize(314, 346, { placement: "above" })}px`;
    expect(edge).toBe("310px");
    expect(document.querySelector<HTMLElement>(".bloom-joystick")).toHaveStyle({ width: edge, height: edge });
  });

  it("keeps joystick controls inside compact and large widget frames", () => {
    expect(resolveJoystickControlSize(80, 80)).toBe(96);
    expect(resolveJoystickControlSize(220, 220)).toBe(216);
    expect(resolveJoystickControlSize(280, 332, { placement: "above" })).toBe(276);
    expect(resolveJoystickControlSize(320, 400, { placement: "above", showDetails: true })).toBe(316);
    expect(resolveJoystickControlSize(720, 720)).toBe(716);
  });

  it("renders topic debug widgets with topic and field context", () => {
    const descriptor = renderScreenDescriptors(topicPlotScreen, createDefaultWidgetRegistry())[0];
    if (!descriptor) throw new Error("Missing topic plot descriptor.");

    render(<div>{renderWidgetDescriptor(descriptor)}</div>);

    expect(screen.getByText("Velocity X")).toBeVisible();
    expect(screen.getByText("/cartesian_command")).toBeVisible();
    expect(screen.getByText("field: velocity.x")).toBeVisible();
  });

  it("renders topic plot samples from widget data snapshots", () => {
    const descriptor = renderScreenDescriptors(topicPlotScreen, createDefaultWidgetRegistry())[0];
    if (!descriptor) throw new Error("Missing topic plot descriptor.");

    render(
      <div>
        {renderWidgetDescriptor(descriptor, {
          dataByWidgetId: {
            "velocity-x": {
              samples: [
                { timestamp: "2026-06-02T10:00:00.000Z", value: 0.2 },
                { timestamp: "2026-06-02T10:00:01.000Z", value: 0.4 },
              ],
              type: "topic-plot",
            },
          },
        })}
      </div>,
    );

    expect(screen.getByText("0.4 m/s")).toBeVisible();
    expect(screen.getByRole("img", { name: "Velocity X live topic plot" })).toBeVisible();
    expect(screen.getByText("0.2 m/s -> 0.4 m/s")).toBeVisible();
  });

  it("can hide technical topic plot context for operator-facing runtime screens", () => {
    const descriptor = renderScreenDescriptors(topicPlotCleanScreen, createDefaultWidgetRegistry())[0];
    if (!descriptor) throw new Error("Missing topic plot descriptor.");

    render(
      <div>
        {renderWidgetDescriptor(descriptor, {
          dataByWidgetId: {
            "velocity-x": {
              samples: [{ timestamp: "2026-06-02T10:00:01.000Z", value: 0.4 }],
              type: "topic-plot",
            },
          },
        })}
      </div>,
    );

    expect(screen.getByText("Velocity X")).toBeVisible();
    expect(screen.queryByText("/cartesian_command")).not.toBeInTheDocument();
    expect(screen.queryByText("field: velocity.x")).not.toBeInTheDocument();
    expect(screen.getByText("1 samples")).toBeVisible();
  });

  it("renders topic echo messages from widget data snapshots", () => {
    const descriptor = renderScreenDescriptors(topicEchoScreen, createDefaultWidgetRegistry())[0];
    if (!descriptor) throw new Error("Missing topic echo descriptor.");

    render(
      <div>
        {renderWidgetDescriptor(descriptor, {
          dataByWidgetId: {
            "joint-state-echo": {
              messages: [
                {
                  receivedAt: "2026-06-02T10:00:00.000Z",
                  topic: "/joint_states",
                  value: { name: ["joint_1"], position: [0.42] },
                },
              ],
              type: "topic-echo",
            },
          },
        })}
      </div>,
    );

    expect(screen.getByText(/joint_1/)).toBeVisible();
    expect(screen.getByText(/0.42/)).toBeVisible();
  });

  it("copies topic echo messages to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    const descriptor = renderScreenDescriptors(topicEchoScreen, createDefaultWidgetRegistry())[0];
    if (!descriptor) throw new Error("Missing topic echo descriptor.");

    render(
      <div>
        {renderWidgetDescriptor(descriptor, {
          dataByWidgetId: {
            "joint-state-echo": {
              messages: [
                {
                  receivedAt: "2026-06-02T10:00:00.000Z",
                  topic: "/joint_states",
                  value: { name: ["joint_1"], position: [0.42] },
                },
              ],
              type: "topic-echo",
            },
          },
        })}
      </div>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Copy" }));

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("joint_1"));
    expect(await screen.findByText("Copied to clipboard.")).toBeVisible();
  });

  it("pauses and clears visible topic echo messages", async () => {
    const descriptor = renderScreenDescriptors(topicEchoScreen, createDefaultWidgetRegistry())[0];
    if (!descriptor) throw new Error("Missing topic echo descriptor.");

    const { rerender } = render(
      <div>
        {renderWidgetDescriptor(descriptor, {
          dataByWidgetId: {
            "joint-state-echo": {
              messages: [
                {
                  receivedAt: "2026-06-02T10:00:00.000Z",
                  topic: "/joint_states",
                  value: { name: ["joint_1"], position: [0.42] },
                },
              ],
              type: "topic-echo",
            },
          },
        })}
      </div>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Pause" }));

    rerender(
      <div>
        {renderWidgetDescriptor(descriptor, {
          dataByWidgetId: {
            "joint-state-echo": {
              messages: [
                {
                  receivedAt: "2026-06-02T10:00:00.000Z",
                  topic: "/joint_states",
                  value: { name: ["joint_1"], position: [0.42] },
                },
                {
                  receivedAt: "2026-06-02T10:00:01.000Z",
                  topic: "/joint_states",
                  value: { name: ["joint_2"], position: [0.84] },
                },
              ],
              type: "topic-echo",
            },
          },
        })}
      </div>,
    );

    expect(screen.getByText(/joint_1/)).toBeVisible();
    expect(screen.queryByText(/joint_2/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(screen.getByText(/joint_2/)).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByText(/has been published this session/)).toBeVisible();
  });

  it("names the command frame in the echo header before anything is sent", () => {
    const descriptor = renderScreenDescriptors(topicEchoScreen, createDefaultWidgetRegistry())[0];
    if (!descriptor) throw new Error("Missing topic echo descriptor.");
    render(
      <div>
        {renderWidgetDescriptor(descriptor, {
          controlStateByWidgetId: { "joint-state-echo": { commandFrameId: "base_link" } },
          dataByWidgetId: { "joint-state-echo": { messages: [], type: "topic-echo" } },
        })}
      </div>,
    );

    // With no message yet the note names the frame the next command will carry.
    expect(screen.getByText("base_link")).toBeVisible();
    expect(screen.queryByText("nothing sent")).toBeNull();
    expect(document.querySelector(".bloom-topic-echo")?.getAttribute("data-empty")).toBe("true");
  });

  it("speaks the echo's own words in the profile's language", () => {
    const detailed = {
      ...topicEchoScreen,
      widgets: topicEchoScreen.widgets.map((widget) => ({
        ...widget,
        settings: { ...widget.settings, show_details: true },
      })),
    };
    const descriptor = renderScreenDescriptors(detailed, createDefaultWidgetRegistry())[0];
    if (!descriptor) throw new Error("Missing topic echo descriptor.");
    render(
      <div>
        {renderWidgetDescriptor(descriptor, {
          dataByWidgetId: { "joint-state-echo": { messages: [], type: "topic-echo" } },
          language: "es",
        })}
      </div>,
    );

    expect(screen.getByRole("button", { name: "Pausar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Borrar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copiar" })).toBeTruthy();
    expect(document.querySelector(".bloom-topic-echo")?.textContent).toContain("No se ha publicado");
  });

  it("shows messages that arrive after Clear even when the buffer is full", async () => {
    const descriptor = renderScreenDescriptors(topicEchoScreen, createDefaultWidgetRegistry())[0];
    if (!descriptor) throw new Error("Missing topic echo descriptor.");
    const message = (index: number) => ({
      receivedAt: `2026-06-02T10:00:0${index}.000Z`,
      topic: "/joint_states",
      value: { name: [`joint_${index}`] },
    });
    const full = [message(1), message(2), message(3)];
    const echo = (messages: typeof full) => (
      <div>
        {renderWidgetDescriptor(descriptor, {
          dataByWidgetId: { "joint-state-echo": { messages, type: "topic-echo" } },
        })}
      </div>
    );

    const { rerender } = render(echo(full));
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    rerender(echo([full[1], full[2], message(4)]));

    expect(screen.getByText(/joint_4/)).toBeVisible();
    expect(screen.queryByText(/joint_3/)).not.toBeInTheDocument();
  });

  it("renders camera image streams with the configured fit mode", () => {
    const descriptor = renderScreenDescriptors(cameraStreamScreen, createDefaultWidgetRegistry())[0];
    if (!descriptor) throw new Error("Missing camera descriptor.");

    render(<div>{renderWidgetDescriptor(descriptor)}</div>);

    const image = screen.getByRole("img", { name: "Garden camera stream" });
    expect(image).toBeVisible();
    expect(image).toHaveAttribute("src", "http://localhost:8000/camera.jpg");
    expect(screen.getByText("Ready")).toBeVisible();
  });

  it("renders webcam previews with discovered browser cameras", async () => {
    const descriptor = renderScreenDescriptors(webcamScreen, createDefaultWidgetRegistry())[0];
    if (!descriptor) throw new Error("Missing webcam descriptor.");
    const stream = createMediaStreamMock();

    mockMediaDevices({
      enumerateDevices: vi.fn(async () => [
        { deviceId: "camera-a", kind: "videoinput" as const, label: "Integrated Camera" },
      ]),
      getUserMedia: vi.fn(async () => stream),
    });

    render(<div>{renderWidgetDescriptor(descriptor)}</div>);

    expect(await screen.findByText("Webcam live")).toBeVisible();
    expect(screen.getByRole("combobox", { name: /camera/i })).toBeVisible();
    expect(screen.getByRole("option", { name: "Integrated Camera" })).toBeInTheDocument();
  });

  it("renders gauge widgets as accessible meters", () => {
    const descriptor = renderScreenDescriptors(gaugeScreen, createDefaultWidgetRegistry())[0];
    if (!descriptor) throw new Error("Missing gauge descriptor.");

    render(<div>{renderWidgetDescriptor(descriptor)}</div>);

    const meter = screen.getByRole("meter", { name: "Battery: 68 %" });
    expect(meter).toHaveAttribute("min", "0");
    expect(meter).toHaveAttribute("max", "100");
    expect(meter).toHaveAttribute("value", "68");
    expect(screen.getAllByText("68")).toHaveLength(2);
  });

  it("renders live gauge values from widget data snapshots", () => {
    const descriptor = renderScreenDescriptors(gaugeScreen, createDefaultWidgetRegistry())[0];
    if (!descriptor) throw new Error("Missing gauge descriptor.");

    render(
      <div>
        {renderWidgetDescriptor(descriptor, {
          dataByWidgetId: {
            battery: {
              receivedAt: "2026-06-08T10:00:00.000Z",
              topic: "/battery/state",
              type: "gauge",
              value: 91,
            },
          },
        })}
      </div>,
    );

    expect(screen.getByRole("meter", { name: "Battery: 91 %" })).toBeVisible();
  });

  it("renders generic plot widgets with a readable sparkline", () => {
    const descriptor = renderScreenDescriptors(plotScreen, createDefaultWidgetRegistry())[0];
    if (!descriptor) throw new Error("Missing plot descriptor.");

    render(<div>{renderWidgetDescriptor(descriptor)}</div>);

    expect(screen.getByLabelText("Velocity trend plot")).toBeVisible();
    expect(screen.getByText("20s history")).toBeVisible();
    expect(screen.getByText("latest 0.9")).toBeVisible();
  });

  it("renders live generic plot values from widget data snapshots", () => {
    const descriptor = renderScreenDescriptors(plotScreen, createDefaultWidgetRegistry())[0];
    if (!descriptor) throw new Error("Missing plot descriptor.");

    render(
      <div>
        {renderWidgetDescriptor(descriptor, {
          dataByWidgetId: {
            "velocity-trend": {
              samples: [
                { timestamp: "2026-06-08T10:00:00.000Z", value: 0.2 },
                { timestamp: "2026-06-08T10:00:01.000Z", value: 0.7 },
              ],
              type: "plot",
            },
          },
        })}
      </div>,
    );

    expect(screen.getByText("2 samples")).toBeVisible();
    expect(screen.getByText("latest 0.7")).toBeVisible();
  });

  it("renders generic plot bar variants with units", () => {
    const descriptor = renderScreenDescriptors(plotBarsScreen, createDefaultWidgetRegistry())[0];
    if (!descriptor) throw new Error("Missing plot descriptor.");

    const { container } = render(<div>{renderWidgetDescriptor(descriptor)}</div>);

    expect(screen.getByText("latest 0.5 m/s")).toBeVisible();
    expect(container.querySelectorAll(".bloom-plot-bar")).toHaveLength(3);
    expect(container.querySelector(".bloom-plot-widget")).toHaveAttribute("data-variant", "bars");
  });

  it("renders robot 3d extension placeholders without looking empty", () => {
    const descriptor = renderScreenDescriptors(robot3dScreen, createDefaultWidgetRegistry())[0];
    if (!descriptor) throw new Error("Missing robot 3d descriptor.");

    render(<div>{renderWidgetDescriptor(descriptor)}</div>);

    expect(screen.getByLabelText("Explorer model placeholder")).toBeVisible();
    expect(screen.getByText("/joint_states")).toBeVisible();
    expect(screen.getByText("URDF adapter coming next.")).toBeVisible();
  });

  it("renders robot 3d joint-state readiness from widget data snapshots", () => {
    const descriptor = renderScreenDescriptors(robot3dScreen, createDefaultWidgetRegistry())[0];
    if (!descriptor) throw new Error("Missing robot 3d descriptor.");

    render(
      <div>
        {renderWidgetDescriptor(descriptor, {
          dataByWidgetId: {
            "explorer-model": {
              receivedAt: "2026-06-08T10:00:00.000Z",
              topic: "/joint_states",
              type: "robot-3d",
              value: { name: ["joint_1", "joint_2", "joint_3"], position: [0, 0.1, 0.2] },
            },
          },
        })}
      </div>,
    );

    expect(screen.getByText("3 live joints")).toBeVisible();
  });

  it("renders event logs as concise operator feedback by default", () => {
    const descriptor = renderScreenDescriptors(eventLogScreen, createDefaultWidgetRegistry())[0];
    if (!descriptor) throw new Error("Missing event log descriptor.");

    render(<div>{renderWidgetDescriptor(descriptor)}</div>);

    expect(screen.getByText("Safety zone active")).toBeVisible();
    expect(screen.getByText("Controller ready")).toBeVisible();
    expect(screen.queryByText("Hidden debug entry")).not.toBeInTheDocument();
    expect(screen.queryByText("Safety adapter accepted the configured boundary.")).not.toBeInTheDocument();
  });

  it("renders live ROS-style event log messages from widget data snapshots", () => {
    const descriptor = renderScreenDescriptors(eventLogScreen, createDefaultWidgetRegistry())[0];
    if (!descriptor) throw new Error("Missing event log descriptor.");

    render(
      <div>
        {renderWidgetDescriptor(descriptor, {
          dataByWidgetId: {
            "operator-events": {
              messages: [
                {
                  receivedAt: "2026-06-08T10:00:00.000Z",
                  topic: "/rosout",
                  value: { level: 30, msg: "Velocity limit active" },
                },
              ],
              type: "event-log",
            },
          },
        })}
      </div>,
    );

    expect(screen.getByText("Velocity limit active")).toBeVisible();
    // Live events replace the authored placeholder entries instead of mixing with them.
    expect(screen.queryByText("Safety zone active")).not.toBeInTheDocument();
  });

  it("can reveal event log details for debug-focused screens", () => {
    const descriptor = renderScreenDescriptors(eventLogDebugScreen, createDefaultWidgetRegistry())[0];
    if (!descriptor) throw new Error("Missing event log descriptor.");

    render(<div>{renderWidgetDescriptor(descriptor)}</div>);

    expect(screen.getByText("Safety adapter accepted the configured boundary.")).toBeVisible();
    expect(document.querySelector('time[datetime="2026-06-04T10:00:00.000Z"]')).toHaveTextContent(/ago$/);
  });
});

const sampleScreen: ScreenConfig = {
  id: "main",
  title: "Main",
  canvas: {
    preset_id: "hd",
    runtime_mode: "fit",
  },
  widgets: [
    {
      id: "hello",
      kind: "label",
      title: "Hello",
      layout: {
        x: 16,
        y: 24,
        width: 280,
        height: 64,
      },
      settings: {
        align: "left",
        fontSize: 20,
        text: "Hello Bloom",
      },
    },
    {
      id: "ros-toggle",
      kind: "toggle",
      title: "Digital output",
      layout: {
        x: 320,
        y: 24,
        width: 220,
        height: 80,
      },
      settings: {
        initialValue: false,
        offPayload: "{data: [13, 0]}",
        onPayload: "{data: [13, 1]}",
        topic: "/ui/ros_toggle",
      },
    },
  ],
};

const centeredLabelScreen: ScreenConfig = {
  id: "labels",
  title: "Labels",
  canvas: {
    preset_id: "hd",
    runtime_mode: "fit",
  },
  widgets: [
    {
      id: "status-label",
      kind: "label",
      title: "Status label",
      layout: {
        height: 72,
        width: 320,
        x: 16,
        y: 24,
      },
      settings: {
        align: "center",
        fontSize: 28,
        text: "Ready for teleop",
      },
    },
  ],
};

const sliderScreen: ScreenConfig = {
  id: "controls",
  title: "Controls",
  canvas: {
    preset_id: "hd",
    runtime_mode: "fit",
  },
  widgets: [
    {
      id: "speed",
      kind: "slider",
      title: "Speed",
      layout: {
        x: 16,
        y: 24,
        width: 220,
        height: 80,
      },
      settings: {
        direction: "horizontal",
        intent_label: "Teleoperation gain",
        max: 2,
        min: 0,
        step: 0.01,
        unit: "m/s",
        value: 0.8,
      },
    },
  ],
};

const sliderDebugScreen: ScreenConfig = {
  ...sliderScreen,
  widgets: [
    {
      ...sliderScreen.widgets[0],
      settings: {
        ...sliderScreen.widgets[0]?.settings,
        show_details: true,
      },
    },
  ],
};

const returnToCenterSliderScreen: ScreenConfig = {
  id: "controls",
  title: "Controls",
  canvas: {
    preset_id: "hd",
    runtime_mode: "fit",
  },
  widgets: [
    {
      id: "teleop-x",
      kind: "slider",
      title: "Teleop X",
      layout: {
        x: 16,
        y: 24,
        width: 220,
        height: 80,
      },
      settings: {
        direction: "horizontal",
        max: 1,
        min: -1,
        returnToCenter: true,
        step: 0.01,
      },
    },
  ],
};

const legacyKeysSliderScreen: ScreenConfig = {
  id: "controls",
  title: "Controls",
  canvas: {
    preset_id: "hd",
    runtime_mode: "fit",
  },
  widgets: [
    {
      id: "drive-z",
      kind: "slider",
      title: "Z",
      layout: {
        x: 16,
        y: 24,
        width: 220,
        height: 80,
      },
      settings: {
        max: 1,
        min: -1,
        orientation: "horizontal",
        return_to_center: true,
        step: 0.01,
      },
    },
  ],
};

const commandButtonScreen: ScreenConfig = {
  id: "actions",
  title: "Actions",
  canvas: {
    preset_id: "hd",
    runtime_mode: "fit",
  },
  widgets: [
    {
      id: "activate-throw",
      kind: "command-button",
      title: "Activate throw",
      layout: {
        x: 16,
        y: 24,
        width: 180,
        height: 72,
      },
      settings: {
        command: "activate_throw",
      },
    },
  ],
};

const momentaryButtonScreen: ScreenConfig = {
  id: "snake",
  title: "Snake",
  canvas: {
    preset_id: "hd",
    runtime_mode: "fit",
  },
  widgets: [
    {
      id: "snake-hold",
      kind: "command-button",
      title: "Hold Snake",
      layout: {
        x: 16,
        y: 24,
        width: 180,
        height: 72,
      },
      settings: {
        button_label: "Hold Snake",
        command: "momentary_ros_message",
        messageType: "std_msgs/msg/Bool",
        momentary: true,
        payload: "{data: true}",
        releasedPayload: "{data: false}",
        topic: "/snake_control/enable",
      },
    },
  ],
};

const toggleScreen: ScreenConfig = {
  id: "devices",
  title: "Devices",
  canvas: {
    preset_id: "hd",
    runtime_mode: "fit",
  },
  widgets: [
    {
      id: "ros-toggle",
      kind: "toggle",
      title: "Digital output",
      layout: {
        x: 16,
        y: 24,
        width: 220,
        height: 96,
      },
      settings: {
        initialValue: false,
        offPayload: "{data: [13, 0]}",
        onPayload: "{data: [13, 1]}",
        topic: "/ui/ros_toggle",
      },
    },
  ],
};

const joystickScreen: ScreenConfig = {
  id: "controls",
  title: "Controls",
  canvas: {
    preset_id: "hd",
    runtime_mode: "fit",
  },
  widgets: [
    {
      id: "translation",
      kind: "joystick",
      title: "Translation",
      layout: {
        x: 16,
        y: 24,
        width: 220,
        height: 220,
      },
      settings: {
        binding: "joy",
        deadzone: 0.1,
        labels: {
          bottom: "Y-",
          left: "X-",
          right: "X+",
          top: "Y+",
        },
      },
    },
  ],
};

const joystickDebugScreen: ScreenConfig = {
  ...joystickScreen,
  widgets: [
    {
      ...joystickScreen.widgets[0],
      settings: {
        ...joystickScreen.widgets[0]?.settings,
        show_details: true,
      },
    },
  ],
};

const gesturePadScreen: ScreenConfig = {
  id: "throw",
  title: "Throw",
  canvas: {
    preset_id: "hd",
    runtime_mode: "fit",
  },
  widgets: [
    {
      id: "throw-gesture",
      kind: "gesture-pad",
      title: "Throw gesture",
      layout: {
        x: 16,
        y: 24,
        width: 360,
        height: 280,
      },
      settings: {
        command: "petanque.throw.preview",
        messageType: "std_msgs/msg/String",
        topic: "/petanque/throw/gesture",
      },
    },
  ],
};

const topicPlotScreen: ScreenConfig = {
  id: "debug",
  title: "Debug",
  canvas: {
    preset_id: "hd",
    runtime_mode: "fit",
  },
  widgets: [
    {
      id: "velocity-x",
      kind: "topic-plot",
      title: "Velocity X",
      layout: {
        x: 16,
        y: 24,
        width: 480,
        height: 260,
      },
      settings: {
        fieldPath: "velocity.x",
        historySeconds: 30,
        maxSamples: 500,
        messageType: "geometry_msgs/msg/Twist",
        topic: "/cartesian_command",
        unit: "m/s",
      },
    },
  ],
};

const topicPlotCleanScreen: ScreenConfig = {
  ...topicPlotScreen,
  widgets: [
    {
      ...topicPlotScreen.widgets[0],
      settings: {
        ...topicPlotScreen.widgets[0]?.settings,
        show_details: false,
      },
    },
  ],
};

const topicEchoScreen: ScreenConfig = {
  id: "debug",
  title: "Debug",
  canvas: {
    preset_id: "hd",
    runtime_mode: "fit",
  },
  widgets: [
    {
      id: "joint-state-echo",
      kind: "topic-echo",
      title: "Joint state echo",
      layout: {
        x: 16,
        y: 24,
        width: 480,
        height: 260,
      },
      settings: {
        fieldPath: "",
        maxMessages: 100,
        messageType: "sensor_msgs/msg/JointState",
        prettyPrint: true,
        topic: "/joint_states",
      },
    },
  ],
};

const cameraStreamScreen: ScreenConfig = {
  id: "camera",
  title: "Camera",
  canvas: {
    preset_id: "hd",
    runtime_mode: "fit",
  },
  widgets: [
    {
      id: "garden-camera",
      kind: "camera",
      title: "Garden camera",
      layout: {
        x: 16,
        y: 24,
        width: 640,
        height: 360,
      },
      settings: {
        fitMode: "cover",
        showHeader: true,
        showStatus: true,
        source: "stream-url",
        streamUrl: "http://localhost:8000/camera.jpg",
      },
    },
  ],
};

const webcamScreen: ScreenConfig = {
  id: "webcam",
  title: "Webcam",
  canvas: {
    preset_id: "hd",
    runtime_mode: "fit",
  },
  widgets: [
    {
      id: "local-webcam",
      kind: "camera",
      title: "Local webcam",
      layout: {
        x: 16,
        y: 24,
        width: 640,
        height: 360,
      },
      settings: {
        fitMode: "cover",
        showHeader: true,
        showStatus: true,
        source: "webcam",
        streamUrl: "webcam:///dev/video0",
        webcamPicker: true,
      },
    },
  ],
};

const gaugeScreen: ScreenConfig = {
  id: "status",
  title: "Status",
  canvas: {
    preset_id: "hd",
    runtime_mode: "fit",
  },
  widgets: [
    {
      id: "battery",
      kind: "gauge",
      title: "Battery",
      layout: {
        x: 16,
        y: 24,
        width: 240,
        height: 160,
      },
      settings: {
        max: 100,
        min: 0,
        unit: "%",
        value: 68,
      },
    },
  ],
};

const plotScreen: ScreenConfig = {
  id: "plots",
  title: "Plots",
  canvas: {
    preset_id: "hd",
    runtime_mode: "fit",
  },
  widgets: [
    {
      id: "velocity-trend",
      kind: "plot",
      title: "Velocity trend",
      layout: {
        x: 16,
        y: 24,
        width: 360,
        height: 220,
      },
      settings: {
        historySeconds: 20,
        samples: [0.1, 0.5, 0.4, 0.9],
        showLegend: true,
      },
    },
  ],
};

const plotBarsScreen: ScreenConfig = {
  ...plotScreen,
  widgets: [
    {
      ...plotScreen.widgets[0],
      settings: {
        historySeconds: 15,
        samples: [0, 1, 0.5],
        showLegend: true,
        unit: "m/s",
        variant: "bars",
        yMax: 1,
        yMin: 0,
      },
    },
  ],
};

const robot3dScreen: ScreenConfig = {
  id: "robot",
  title: "Robot",
  canvas: {
    preset_id: "hd",
    runtime_mode: "fit",
  },
  widgets: [
    {
      id: "explorer-model",
      kind: "robot-3d",
      title: "Explorer model",
      layout: {
        x: 16,
        y: 24,
        width: 360,
        height: 240,
      },
      settings: {
        description: "URDF adapter coming next.",
        jointStateTopic: "/joint_states",
        modelSource: "extension",
        robotModelUrl: "",
        showAxes: true,
      },
    },
  ],
};

const eventLogScreen: ScreenConfig = {
  id: "events",
  title: "Events",
  canvas: {
    preset_id: "hd",
    runtime_mode: "fit",
  },
  widgets: [
    {
      id: "operator-events",
      kind: "event-log",
      title: "Operator events",
      layout: {
        x: 16,
        y: 24,
        width: 520,
        height: 280,
      },
      settings: {
        entries: [
          {
            detail: "Safety adapter accepted the configured boundary.",
            severity: "success",
            summary: "Safety zone active",
            timestamp: "2026-06-04T10:00:00.000Z",
          },
          {
            severity: "info",
            summary: "Controller ready",
            timestamp: "2026-06-04T10:00:01.000Z",
          },
          {
            severity: "error",
            summary: "Hidden debug entry",
          },
        ],
        maxEntries: 5,
        severityFilter: ["success", "info", "warning"],
        showTimestamps: false,
        show_details: false,
      },
    },
  ],
};

const eventLogDebugScreen: ScreenConfig = {
  ...eventLogScreen,
  widgets: [
    {
      ...eventLogScreen.widgets[0],
      settings: {
        ...eventLogScreen.widgets[0]?.settings,
        showTimestamps: true,
        show_details: true,
      },
    },
  ],
};

function createWidgetRendererRegistryCompatibleWithNoWidgets() {
  return createWidgetRegistry();
}

function getJoystickZone(): HTMLElement {
  const joystickZone = document.querySelector<HTMLElement>(".bloom-joystick-zone");
  if (!joystickZone) {
    throw new Error("Missing joystick zone.");
  }

  joystickZone.getBoundingClientRect = () =>
    ({
      bottom: 200,
      height: 100,
      left: 100,
      right: 200,
      top: 100,
      width: 100,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    }) as DOMRect;

  return joystickZone;
}

function createMediaStreamMock(): MediaStream {
  return {
    getTracks: vi.fn(() => [{ stop: vi.fn() }]),
  } as unknown as MediaStream;
}

function mockMediaDevices(mediaDevices: {
  enumerateDevices: () => Promise<Partial<MediaDeviceInfo>[]>;
  getUserMedia: () => Promise<MediaStream>;
}) {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: mediaDevices,
  });
}

describe("operator words in the profile's language", () => {
  it("draws the operator row in French with identical controls", () => {
    const localeScreen: ScreenConfig = {
      id: "operator",
      title: "Drive · Operator",
      canvas: { preset_id: "native-1280x720", runtime_mode: "fit" },
      widgets: [
        {
          id: "drive-gripper",
          kind: "toggle",
          title: "Gripper",
          layout: { x: 1064, y: 14, width: 202, height: 168 },
          settings: {
            offLabel: "Close gripper",
            onLabel: "Open gripper",
            offStateLabel: "open",
            onStateLabel: "closed",
            initialValue: false,
            topic: "/gripper_controller/commands",
            messageType: "std_msgs/msg/Float64MultiArray",
            onPayload: "{data: [0.8]}",
            offPayload: "{data: [0.0]}",
          },
        },
        {
          id: "drive-rz",
          kind: "slider",
          title: "Pivot",
          layout: { x: 738, y: 404, width: 314, height: 146 },
          settings: { direction: "horizontal", returnToCenter: true, min: -1, max: 1, step: 0.01, value: 0 },
        },
      ],
    };
    const descriptors = renderScreenDescriptors(localeScreen, createDefaultWidgetRegistry());
    render(<div>{descriptors.map((descriptor) => renderWidgetDescriptor(descriptor, { language: "fr" }))}</div>);

    expect(screen.getByText("Fermer la pince")).toBeVisible();
    expect(screen.getByText("commandé : ouverte")).toBeVisible();
    expect(screen.getByText("Pince")).toBeVisible();
    expect(screen.getByRole("slider", { name: "Pivot" })).toBeTruthy();
    expect(document.querySelector('.bloom-axis-word[data-end="negative"]')?.textContent).toBe("◀\u00a0Gauche");
  });
});

describe("a display widget with nothing behind it", () => {
  // explorer-user-tests ships gauges with no topic at all. Drawn like a reading, an authored 76 becomes
  // a claim about the robot's battery to whoever is sitting in front of it.
  it("says so rather than presenting its authored placeholder as a reading", () => {
    render(
      <GaugeWidget
        descriptor={
          {
            widget: {
              id: "battery",
              kind: "gauge",
              title: "Battery",
              layout: { x: 0, y: 0, width: 240, height: 160 },
              settings: { max: 100, min: 0, unit: "%", value: 76 },
            },
          } as never
        }
      />,
    );

    expect(screen.getByText("no source")).toBeTruthy();
    expect(document.querySelector('.bloom-gauge-widget[data-live="false"]')).not.toBeNull();
  });

  it("marks a gauge live once a sample arrives", () => {
    render(
      <GaugeWidget
        // Fresh on purpose: a fixed timestamp ages past the stale threshold as the clock moves on.
        data={{ type: "gauge", receivedAt: new Date().toISOString(), topic: "/battery", value: 42 }}
        descriptor={
          {
            widget: {
              id: "battery",
              kind: "gauge",
              title: "Battery",
              layout: { x: 0, y: 0, width: 240, height: 160 },
              settings: { max: 100, min: 0, unit: "%", value: 76 },
            },
          } as never
        }
      />,
    );

    expect(screen.queryByText("no source")).toBeNull();
    expect(document.querySelector('.bloom-gauge-widget[data-live="true"]')).not.toBeNull();
  });
});

describe("a widget that cannot be drawn", () => {
  // The runtime's only boundary was the view, so one throwing renderer replaced the whole operating
  // surface -- STOP included. A screen missing one card is recoverable; one missing STOP is not.
  it("fails inside its own card and leaves the rest of the screen standing", () => {
    const registry = createWidgetRendererRegistry([
      {
        kind: "gauge",
        render: () => {
          throw new Error("no settings at all");
        },
      } as WidgetRendererRegistration,
    ]);
    const screenConfig = {
      id: "s1",
      title: "Drive",
      canvas: { preset_id: "hd", width: 1280, height: 720 },
      reserved_regions: [],
      widgets: [
        {
          id: "broken",
          kind: "gauge",
          title: "Battery",
          layout: { x: 0, y: 0, width: 200, height: 120 },
          settings: {},
        },
        { id: "fine", kind: "label", title: "Speed", layout: { x: 0, y: 200, width: 200, height: 80 }, settings: {} },
      ],
    } as unknown as ScreenConfig;

    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <div>
        {renderScreenWidgets(renderScreenDescriptors(screenConfig, createDefaultWidgetRegistry()), { registry })}
      </div>,
    );

    expect(screen.getByText("This control could not be drawn. It is sending nothing.")).toBeTruthy();
    expect(screen.getByRole("article", { name: "Speed Label" })).toBeTruthy();
  });
});

describe("a topic echo's pretty print", () => {
  // It is a required field in the Builder and it hardcoded pretty, so an author who turned it off
  // watched nothing happen. A required setting that does nothing is the worst kind.
  it("follows the setting the author chose", () => {
    const value = { data: [13, 1] };

    expect(formatEchoMessage(value, true)).toContain("\n");
    expect(formatEchoMessage(value, false)).toBe('{"data":[13,1]}');
  });
});
