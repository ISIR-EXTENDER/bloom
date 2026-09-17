/**
 * @vitest-environment jsdom
 */
import type { ScreenConfig } from "@bloom/api-client";
import { createDefaultWidgetRegistry, renderScreenDescriptors } from "@bloom/widgets";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { renderWidgetDescriptor } from "./index";

const debugScreen: ScreenConfig = {
  id: "debug",
  title: "Runtime topic monitor",
  canvas: { preset_id: "full-hd", runtime_mode: "fit" },
  widgets: [
    {
      id: "joints",
      kind: "joint-table",
      title: "Joint states",
      layout: { x: 14, y: 582, width: 724, height: 440 },
      settings: { topic: "/joint_states", joint_limits: { joint_1: [-1, 1], joint_2: [-2, 2] } },
    },
    {
      id: "jacobian",
      kind: "jacobian",
      title: "Jacobian",
      layout: { x: 750, y: 582, width: 724, height: 440 },
      settings: { topic: "/ee_jac" },
    },
  ],
};

function renderWidget(index: number, value?: unknown) {
  const descriptor = renderScreenDescriptors(debugScreen, createDefaultWidgetRegistry())[index];
  if (!descriptor) throw new Error("Missing descriptor.");
  const messages = value === undefined ? [] : [{ receivedAt: "2026-09-17T10:00:00Z", topic: "", value }];
  return render(
    <div>
      {renderWidgetDescriptor(descriptor, {
        dataByWidgetId: { [descriptor.widget.id]: { type: "topic-echo", messages } },
      })}
    </div>,
  );
}

describe("the joint table", () => {
  afterEach(cleanup);

  it("waits for joint states instead of inventing rows", () => {
    renderWidget(0);
    expect(screen.getByText("Waiting for /joint_states.")).toBeTruthy();
  });

  it("colours proximity at 80 % and says when no limit is known", () => {
    const { container } = renderWidget(0, {
      name: ["joint_1", "joint_2", "joint_3"],
      position: [0.9, 0.5, 0.1],
      velocity: [0.01, -0.2, 0],
      effort: [1.5, -2, 0],
    });

    const levels = [...container.querySelectorAll(".bloom-joint-proximity")].map((cell) => [
      cell.getAttribute("data-level"),
      cell.textContent,
    ]);
    expect(levels).toEqual([
      ["limit", "90%"],
      ["clear", "25%"],
    ]);
    expect(screen.getByText("not reported")).toBeTruthy();
    expect(screen.getByText("−0.200")).toBeTruthy();
  });
});

describe("the jacobian", () => {
  afterEach(cleanup);

  it("says no Jacobian arrived, and not reported for a message of the wrong shape", () => {
    renderWidget(1);
    expect(screen.getByText("No Jacobian received on /ee_jac.")).toBeTruthy();
    cleanup();

    renderWidget(1, { data: [1, 2, 3, 4, 5] });
    expect(screen.getByText("The message on /ee_jac is not a Jacobian: not reported.")).toBeTruthy();
  });

  it("draws the matrix, marks strong entries and measures manipulability", () => {
    const identity = Array.from({ length: 36 }, (_, index) => (index % 7 === 0 ? 0.9 : 0.1));
    const { container } = renderWidget(1, { data: identity });

    expect(screen.getByText("/ee_jac · 6×6")).toBeTruthy();
    expect(container.querySelectorAll(".bloom-jacobian-grid td")).toHaveLength(36);
    expect(container.querySelectorAll('[data-strong="true"]')).toHaveLength(6);
    expect(container.querySelector(".bloom-jacobian-manipulability output")?.textContent).toMatch(/^\d\.\d{3}$/);
    expect(screen.getByText("100% of this session's best")).toBeTruthy();
  });

  it("starts a new best when the data goes missing or pauses, not only on reload", () => {
    const descriptor = renderScreenDescriptors(debugScreen, createDefaultWidgetRegistry())[1];
    if (!descriptor) throw new Error("Missing descriptor.");
    const matrix = (scale: number) => Array.from({ length: 36 }, (_, index) => (index % 7 === 0 ? scale : 0));
    const view = (scale: number | null, receivedAt = "2026-09-17T10:00:00Z") => (
      <div>
        {renderWidgetDescriptor(descriptor, {
          dataByWidgetId: {
            jacobian: {
              type: "topic-echo",
              messages: scale === null ? [] : [{ receivedAt, topic: "/ee_jac", value: { data: matrix(scale) } }],
            },
          },
        })}
      </div>
    );
    const { rerender } = render(view(1));

    rerender(view(0.9, "2026-09-17T10:00:00.100Z"));
    expect(screen.getByText(/^\d+% of this session's best$/).textContent).not.toBe("100% of this session's best");

    rerender(view(null));
    rerender(view(0.9, "2026-09-17T10:00:01Z"));
    expect(screen.getByText("100% of this session's best")).toBeTruthy();

    rerender(view(1, "2026-09-17T10:00:01.100Z"));
    rerender(view(0.9, "2026-09-17T10:01:00Z"));
    expect(screen.getByText("100% of this session's best")).toBeTruthy();
  });
});
