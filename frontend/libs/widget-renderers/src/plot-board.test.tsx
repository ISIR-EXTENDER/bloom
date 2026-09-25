/**
 * @vitest-environment jsdom
 */
import type { ScreenConfig } from "@bloom/api-client";
import { createDefaultWidgetRegistry, readPlotSeries, renderScreenDescriptors } from "@bloom/widgets";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWidgetDescriptor } from "./index";
import type { PlotSeriesSnapshot } from "./types";

const series = [
  { topic: "/tablet_cartesian_command", field_path: "twist.linear.x", label: "This tablet", color: "#7e967e" },
  {
    topic: "/visual_servoing_cartesian_command",
    field_path: "twist.linear.x",
    label: "Visual servoing",
    color: "#c98a7e",
  },
  {
    topic: "/cartesian_command",
    field_path: "twist.linear.x",
    label: "Manager output",
    color: "#31493f",
    emphasis: true,
  },
  { topic: "/ee_pose", field_path: "pose.position.z", label: "Height", unit: "m", enabled: false },
];

const sourcesScreen: ScreenConfig = {
  id: "sources",
  title: "Command sources",
  canvas: { preset_id: "native-1280x720", runtime_mode: "fit" },
  widgets: [
    {
      id: "sources-plot",
      kind: "plot-board",
      title: "linear.x by source",
      layout: { x: 14, y: 50, width: 902, height: 400 },
      settings: { series, history_seconds: 30, y_min: -1, y_max: 1 },
    },
    {
      id: "sources-picker",
      kind: "plot-picker",
      title: "Sources",
      layout: { x: 928, y: 50, width: 338, height: 348 },
      settings: {
        plot_id: "sources-plot",
        show_value: true,
        unavailable: [{ label: "Joint states", note: "moved to Bloom Debug" }],
      },
    },
    {
      id: "values",
      kind: "value-strip",
      title: "Current values",
      layout: { x: 14, y: 462, width: 902, height: 200 },
      settings: { series },
    },
  ],
};

function snapshot(values: Record<string, number>, ageMs = 0): PlotSeriesSnapshot[] {
  const time = Date.now() - ageMs;
  return readPlotSeries({ series }).map((entry) => ({
    ...entry,
    samples: entry.label in values ? [{ time, value: values[entry.label] as number }] : [],
  }));
}

function renderWidget(index: number, data?: PlotSeriesSnapshot[], onActionIntent = vi.fn()) {
  const descriptor = renderScreenDescriptors(sourcesScreen, createDefaultWidgetRegistry())[index];
  if (!descriptor) throw new Error("Missing descriptor.");
  render(
    <div>
      {renderWidgetDescriptor(descriptor, {
        dataByWidgetId: data ? { [descriptor.widget.id]: { type: "plot-series", series: data } } : {},
        onActionIntent,
      })}
    </div>,
  );
  return onActionIntent;
}

describe("the plot board", () => {
  afterEach(cleanup);

  it("draws enabled series in their ramp colour, the output at double weight", () => {
    renderWidget(0, snapshot({ "This tablet": 0.5, "Manager output": 0.5, Height: 0.2 }));

    expect(screen.getByText("3 series · −30 s → now")).toBeTruthy();
    const lines = [...document.querySelectorAll<SVGPathElement>(".bloom-plot-board-line")];
    expect(lines.map((line) => line.getAttribute("style"))).toEqual([
      "--bloom-series-color: var(--bloom-series-2);",
      "--bloom-series-color: var(--bloom-series-1);",
    ]);
    expect(lines[1]?.getAttribute("data-emphasis")).toBe("true");
  });

  it("keeps a sample that lands after the clock tick on the right edge", () => {
    renderWidget(0, snapshot({ "This tablet": 0.5 }, -400));

    const line = document.querySelector<SVGPathElement>(".bloom-plot-board-line");
    const x = Number(line?.getAttribute("d")?.match(/[ML](-?[\d.]+)/)?.[1]);
    expect(x).toBeLessThanOrEqual(1000);
  });

  it("states which source is driving", () => {
    renderWidget(0, snapshot({ "This tablet": 0.5, "Manager output": 0.5 }));
    expect(screen.getByText("this tablet is driving")).toBeTruthy();
  });

  it("says nothing is commanding before any sample", () => {
    renderWidget(0);
    expect(screen.getByText("nothing is commanding")).toBeTruthy();
  });

  it("widens a ±1 range to take in a joint at 2.5 rad and labels the real bounds", () => {
    renderWidget(0, snapshot({ "This tablet": 2.5, "Manager output": -0.5 }));

    expect(document.querySelector('[data-edge="top"]')?.textContent).toBe("+2.7");
    expect(document.querySelector('[data-edge="bottom"]')?.textContent).toBe("−1.0");
    const line = document.querySelector<SVGPathElement>('[data-series="/tablet_cartesian_command#twist.linear.x"]');
    // Not pinned to the top edge at y = 0.
    expect(Number(line?.getAttribute("d")?.split(" ")[1])).toBeGreaterThan(40);
  });

  it("keeps the declared range when a board opts out of fitting", () => {
    const board = sourcesScreen.widgets[0];
    if (!board) throw new Error("Missing board.");
    const fixedScreen = {
      ...sourcesScreen,
      widgets: [{ ...board, settings: { ...board.settings, y_fit_data: false } }],
    };
    const [descriptor] = renderScreenDescriptors(fixedScreen, createDefaultWidgetRegistry());
    if (!descriptor) throw new Error("Missing descriptor.");
    render(
      <div>
        {renderWidgetDescriptor(descriptor, {
          dataByWidgetId: { "sources-plot": { type: "plot-series", series: snapshot({ "This tablet": 2.5 }) } },
        })}
      </div>,
    );

    expect(document.querySelector('[data-edge="top"]')?.textContent).toBe("+1.0");
  });
});

describe("the plot picker", () => {
  afterEach(cleanup);

  it("toggles its board's series and shows live values", () => {
    const onActionIntent = renderWidget(1, snapshot({ "Visual servoing": -0.25 }));

    const servo = screen.getByRole("button", { name: /Visual servoing/ });
    expect(servo.getAttribute("aria-pressed")).toBe("true");
    expect(servo.textContent).toContain("−0.25");
    expect(screen.getByRole("button", { name: /Height/ }).getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(servo);
    expect(onActionIntent).toHaveBeenCalledWith({
      type: "plot-series-toggle",
      plotId: "sources-plot",
      seriesKey: "/visual_servoing_cartesian_command#twist.linear.x",
      widgetId: "sources-picker",
      widgetKind: "plot-picker",
    });
  });

  it("lists moved series as inert rows that say where they went", () => {
    renderWidget(1, snapshot({}));

    expect(screen.getByText("moved to Bloom Debug")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Joint states/ })).toBeNull();
  });
});

describe("the value strip", () => {
  afterEach(cleanup);

  it("shows each latest value, or a dash before one arrives", () => {
    renderWidget(2, snapshot({ Height: 0.25 }));

    expect(screen.getByText("+0.25")).toBeTruthy();
    expect(screen.getAllByText("—")).toHaveLength(3);
    expect(screen.queryByText("stale")).toBeNull();
  });

  it("marks a value that stopped arriving as stale instead of showing it as live", () => {
    renderWidget(2, snapshot({ Height: 0.25 }, 5000));

    expect(screen.getByText("+0.25").closest("li")?.getAttribute("data-stale")).toBe("true");
    expect(screen.getByText("stale")).toBeTruthy();
  });

  it("marks a stale value in the picker too", () => {
    renderWidget(1, snapshot({ "Visual servoing": -0.25 }, 5000));

    expect(screen.getByRole("button", { name: /Visual servoing/ }).textContent).toContain("stale");
    expect(screen.getByText("−0.25").getAttribute("data-stale")).toBe("true");
  });
});
