/**
 * @vitest-environment jsdom
 */
import type { ScreenConfig } from "@bloom/api-client";
import { createDefaultWidgetRegistry, renderScreenDescriptors } from "@bloom/widgets";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderWidgetDescriptor } from "./index";

const screenWithHiddenTitles: ScreenConfig = {
  id: "bare",
  title: "Bare cards",
  canvas: { preset_id: "hd", runtime_mode: "fit" },
  widgets: [
    {
      id: "g",
      kind: "gauge",
      title: "Force",
      layout: { x: 0, y: 0, width: 280, height: 148 },
      settings: { hide_title: true },
    },
    {
      id: "s",
      kind: "slider",
      title: "Height",
      layout: { x: 300, y: 0, width: 104, height: 252 },
      settings: { hide_title: true, direction: "vertical", min: -1, max: 1, step: 0.01, value: 0 },
    },
    {
      id: "t",
      kind: "toggle",
      title: "Gripper",
      layout: { x: 420, y: 0, width: 200, height: 88 },
      settings: { hide_title: true },
    },
    {
      id: "j",
      kind: "joint-table",
      title: "Joints",
      layout: { x: 0, y: 300, width: 480, height: 248 },
      settings: { hide_title: true, topic: "/joint_states" },
    },
  ],
};

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverMock;

afterEach(cleanup);

describe("a card with its title hidden", () => {
  // The runtime frame still names the card for assistive tech; only the drawn title goes.
  it.each([0, 1, 2, 3])("draws no header for widget %i", (index) => {
    const descriptor = renderScreenDescriptors(screenWithHiddenTitles, createDefaultWidgetRegistry())[index];
    if (descriptor?.status !== "resolved") {
      throw new Error("the fixture did not resolve");
    }
    const { container } = render(renderWidgetDescriptor(descriptor));
    expect(container.querySelector("header")).toBeNull();
  });
});
