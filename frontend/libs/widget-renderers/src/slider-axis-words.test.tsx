/**
 * @vitest-environment jsdom
 */
import type { ScreenConfig } from "@bloom/api-client";
import { createDefaultWidgetRegistry, renderScreenDescriptors } from "@bloom/widgets";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderWidgetDescriptor } from "./index";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverMock;

function renderSlider(component: string) {
  const sliderScreen: ScreenConfig = {
    id: "drive",
    title: "Drive",
    canvas: { preset_id: "hd", runtime_mode: "fit" },
    widgets: [
      {
        id: "s",
        kind: "slider",
        title: "Axis",
        layout: { x: 0, y: 0, width: 370, height: 112 },
        settings: {
          direction: "horizontal",
          returnToCenter: true,
          min: -1,
          max: 1,
          step: 0.01,
          value: 0,
          runtime_binding: { adapter: "teleop", target: component, axis_mapping: { value: { component } } },
        },
      },
    ],
  };
  const descriptor = renderScreenDescriptors(sliderScreen, createDefaultWidgetRegistry())[0];
  if (descriptor?.status !== "resolved") throw new Error("the fixture did not resolve");
  render(renderWidgetDescriptor(descriptor, {}));
}

describe("a slider's end words", () => {
  afterEach(cleanup);

  // The camera test apps' Height slider is laid out horizontally and read "Left" and "Right".
  it("say Down and Up for height, whichever way the slider is laid out", () => {
    renderSlider("linear_z");
    expect(screen.getByText("▼ Down")).toBeTruthy();
    expect(screen.getByText("▲ Up")).toBeTruthy();
  });

  it("follow the orientation for any other axis", () => {
    renderSlider("linear_y");
    expect(screen.getByText("◀ Left")).toBeTruthy();
  });
});
