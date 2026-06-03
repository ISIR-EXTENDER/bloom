/**
 * @vitest-environment jsdom
 */
import type { ScreenConfig } from "@bloom/api-client";
import { createDefaultWidgetRegistry, createWidgetRegistry, renderScreenDescriptors } from "@bloom/widgets";
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createWidgetRendererRegistry,
  renderScreenWidgets,
  renderWidgetDescriptor,
  resolveJoystickControlSize,
  type WidgetRendererRegistration,
} from "./index";

const nippleMock = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const create = vi.fn(() => {
    const manager = {
      destroy: vi.fn(),
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        handlers.set(event, handler);
        return manager;
      }),
    };
    return manager;
  });
  return { create, handlers };
});

vi.mock("nipplejs", () => ({
  create: nippleMock.create,
  default: {
    create: nippleMock.create,
  },
}));

class ResizeObserverMock {
  disconnect() {}
  observe() {}
  unobserve() {}
}

globalThis.ResizeObserver = ResizeObserverMock;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  nippleMock.create.mockClear();
  nippleMock.handlers.clear();
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
    expect(screen.getByText("Label")).toBeVisible();
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
    expect(screen.getByText("/ui/ros_toggle")).toBeVisible();
    expect(container.querySelectorAll("[data-screen-id='main']")).toHaveLength(2);
  });

  it("emits value-change intents from interactive sliders", async () => {
    const descriptor = renderScreenDescriptors(sliderScreen, createDefaultWidgetRegistry())[0];
    if (!descriptor) throw new Error("Missing slider descriptor.");
    const onActionIntent = vi.fn();
    const user = userEvent.setup();

    render(<div>{renderWidgetDescriptor(descriptor, { onActionIntent })}</div>);

    expect(screen.getByText("0.00")).toBeVisible();
    screen.getByRole("slider", { name: "Speed" }).focus();
    await user.keyboard("{ArrowRight}");

    expect(onActionIntent).toHaveBeenCalledWith({
      type: "value-change",
      widgetId: "speed",
      widgetKind: "slider",
      value: expect.any(Number),
    });
  });

  it("emits command intents from command buttons", async () => {
    const descriptor = renderScreenDescriptors(commandButtonScreen, createDefaultWidgetRegistry())[0];
    if (!descriptor) throw new Error("Missing command button descriptor.");
    const onActionIntent = vi.fn();
    const user = userEvent.setup();

    render(<div>{renderWidgetDescriptor(descriptor, { onActionIntent })}</div>);

    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(onActionIntent).toHaveBeenCalledWith({
      command: "activate_throw",
      type: "command",
      widgetId: "activate-throw",
      widgetKind: "command-button",
    });
  });

  it("emits topic publish intents from toggles", async () => {
    const descriptor = renderScreenDescriptors(toggleScreen, createDefaultWidgetRegistry())[0];
    if (!descriptor) throw new Error("Missing toggle descriptor.");
    const onActionIntent = vi.fn();
    const user = userEvent.setup();

    render(<div>{renderWidgetDescriptor(descriptor, { onActionIntent })}</div>);

    await user.click(screen.getByRole("button", { name: "OFF" }));

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

    await waitFor(() => expect(nippleMock.create).toHaveBeenCalled());
    expect(nippleMock.create).toHaveBeenCalledWith(expect.objectContaining({ color: "#7fa95f", size: 102 }));
    act(() => {
      nippleMock.handlers.get("move")?.({}, { vector: { x: 0.5, y: -0.25 } });
    });

    expect(onActionIntent).toHaveBeenCalledWith({
      binding: "joy",
      type: "value-change",
      value: { x: 0.5, y: -0.25 },
      widgetId: "translation",
      widgetKind: "joystick",
    });
    expect(screen.getByText("x 0.50")).toBeVisible();
    expect(screen.getByText("y -0.25")).toBeVisible();
  });

  it("keeps joystick controls inside compact and large widget frames", () => {
    expect(resolveJoystickControlSize(80, 80)).toBe(96);
    expect(resolveJoystickControlSize(220, 220)).toBe(102);
    expect(resolveJoystickControlSize(720, 720)).toBe(260);
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

    expect(screen.getByText("latest: 0.4")).toBeVisible();
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

  it("renders camera image streams with the configured fit mode", () => {
    const descriptor = renderScreenDescriptors(cameraStreamScreen, createDefaultWidgetRegistry())[0];
    if (!descriptor) throw new Error("Missing camera descriptor.");

    render(<div>{renderWidgetDescriptor(descriptor)}</div>);

    const image = screen.getByRole("img", { name: "Garden camera stream" });
    expect(image).toBeVisible();
    expect(image).toHaveAttribute("src", "http://localhost:8000/camera.jpg");
    expect(screen.getByText("Stream preview")).toBeVisible();
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
        max: 2,
        min: 0,
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

function createWidgetRendererRegistryCompatibleWithNoWidgets() {
  return createWidgetRegistry();
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
