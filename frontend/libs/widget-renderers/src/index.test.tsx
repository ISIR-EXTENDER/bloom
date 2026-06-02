/**
 * @vitest-environment jsdom
 */
import type { ScreenConfig } from "@bloom/api-client";
import { createDefaultWidgetRegistry, createWidgetRegistry, renderScreenDescriptors } from "@bloom/widgets";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createWidgetRendererRegistry,
  renderScreenWidgets,
  renderWidgetDescriptor,
  type WidgetRendererRegistration,
} from "./index";

class ResizeObserverMock {
  disconnect() {}
  observe() {}
  unobserve() {}
}

globalThis.ResizeObserver = ResizeObserverMock;

afterEach(() => {
  cleanup();
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

    screen.getByRole("slider", { name: "Speed" }).focus();
    await user.keyboard("{ArrowRight}");

    expect(onActionIntent).toHaveBeenCalledWith({
      type: "value-change",
      widgetId: "speed",
      widgetKind: "slider",
      value: expect.any(Number),
    });
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

function createWidgetRendererRegistryCompatibleWithNoWidgets() {
  return createWidgetRegistry();
}
