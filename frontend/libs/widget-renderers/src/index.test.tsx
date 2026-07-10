/**
 * @vitest-environment jsdom
 */
import type { ScreenConfig } from "@bloom/api-client";
import { createDefaultWidgetRegistry, createWidgetRegistry, renderScreenDescriptors } from "@bloom/widgets";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

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

    expect(screen.getByText("0.00 m/s")).toHaveClass("sr-only");
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
    expect(slider.closest(".bloom-slider")).toHaveAttribute("data-return-to-center", "true");
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
    expect(screen.getByText("0.00")).toHaveClass("sr-only");
  });

  it("shows slider runtime details only when requested", () => {
    const descriptor = renderScreenDescriptors(sliderDebugScreen, createDefaultWidgetRegistry())[0];
    if (!descriptor) throw new Error("Missing slider descriptor.");

    render(<div>{renderWidgetDescriptor(descriptor)}</div>);

    expect(screen.getByText("0.00 m/s → 2.00 m/s")).toBeVisible();
    expect(screen.getByText("0.00 m/s")).toBeVisible();
  });

  it("shows slider unit and operator intent without exposing runtime details", () => {
    const descriptor = renderScreenDescriptors(sliderScreen, createDefaultWidgetRegistry())[0];
    if (!descriptor) throw new Error("Missing slider descriptor.");

    render(<div>{renderWidgetDescriptor(descriptor)}</div>);

    expect(screen.getByText("m/s")).toBeVisible();
    expect(screen.getByText("Teleoperation gain")).toBeVisible();
    expect(screen.getByText("0.00 m/s")).toHaveClass("sr-only");
    expect(screen.getByText("0.00 m/s → 2.00 m/s")).toHaveClass("bloom-control-detail-hidden");
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
    fireEvent.pointerDown(button, { pointerId: 1 });
    fireEvent.pointerLeave(button, { pointerId: 1 });
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
          target_topic: "/teleop_cmd",
        },
      },
      type: "value-change",
      value: { x: 0.5, y: -0.25 },
      widgetId: "translation",
      widgetKind: "joystick",
      zeroOnRelease: true,
    });
    expect(screen.getByText("x 0.50").parentElement).toHaveClass("sr-only");
    expect(screen.getByText("y -0.25").parentElement).toHaveClass("sr-only");
  });

  it("shows joystick runtime details only when requested", () => {
    const descriptor = renderScreenDescriptors(joystickDebugScreen, createDefaultWidgetRegistry())[0];
    if (!descriptor) throw new Error("Missing joystick descriptor.");

    render(<div>{renderWidgetDescriptor(descriptor)}</div>);

    expect(screen.getAllByText("both")).toHaveLength(2);
    expect(screen.getByText("translation / translation")).toBeVisible();
    expect(screen.getByText("30 Hz")).toBeVisible();
    expect(screen.getByText("x 0.00")).toBeVisible();
    expect(screen.getByText("y 0.00")).toBeVisible();
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

  it("keeps joystick controls inside compact and large widget frames", () => {
    expect(resolveJoystickControlSize(80, 80)).toBe(96);
    expect(resolveJoystickControlSize(220, 220)).toBe(164);
    expect(resolveJoystickControlSize(220, 220, { showDetails: true })).toBe(102);
    expect(resolveJoystickControlSize(720, 720)).toBe(400);
  });

  it("renders topic debug widgets with topic and field context", () => {
    const descriptor = renderScreenDescriptors(topicPlotScreen, createDefaultWidgetRegistry())[0];
    if (!descriptor) throw new Error("Missing topic plot descriptor.");

    render(<div>{renderWidgetDescriptor(descriptor)}</div>);

    expect(screen.getByText("Velocity X")).toBeVisible();
    expect(screen.getByText("/sandbox_controller/velocity_command")).toBeVisible();
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
    expect(screen.queryByText("/sandbox_controller/velocity_command")).not.toBeInTheDocument();
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
    expect(screen.getByText("Waiting for messages...")).toBeVisible();
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
    expect(screen.getByText("3 events")).toBeVisible();
  });

  it("can reveal event log details for debug-focused screens", () => {
    const descriptor = renderScreenDescriptors(eventLogDebugScreen, createDefaultWidgetRegistry())[0];
    if (!descriptor) throw new Error("Missing event log descriptor.");

    render(<div>{renderWidgetDescriptor(descriptor)}</div>);

    expect(screen.getByText("Safety adapter accepted the configured boundary.")).toBeVisible();
    expect(screen.getByText("2026-06-04T10:00:00.000Z")).toBeVisible();
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
        topic: "/sandbox_controller/velocity_command",
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
