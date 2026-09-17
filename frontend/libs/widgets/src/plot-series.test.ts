import { describe, expect, it } from "vitest";

import designSystemPage from "../../../../docs/design/design-system.html?raw";

import { plotSeriesKey, readPlotSeries, readPlotUnavailable, resolvePlotVerdict, SERIES_RAMP } from "./plot-series";

const NOW = Date.parse("2026-09-17T10:00:00.000Z");
const at = (msAgo: number, value: number) => ({ timestamp: new Date(NOW - msAgo).toISOString(), value });

describe("plot series", () => {
  it("uses the ramp the design system documents", () => {
    const documented = [...designSystemPage.matchAll(/series-(\d)<\\u002Fdiv><div[^>]*>(#[0-9a-f]{6})/g)].map(
      ([, , hex]) => hex,
    );
    expect(documented).toEqual(SERIES_RAMP);
  });

  it("keeps a seed colour's ramp slot and falls back to order", () => {
    const series = readPlotSeries({
      series: [
        { topic: "/joystick_cartesian_command", field_path: "twist.linear.x", label: "This tablet", color: "#7E967E" },
        { topic: "/cartesian_command", field_path: "twist.linear.x", color: "#123456", emphasis: true },
        { topic: "no-slash", field_path: "data" },
        { topic: "/ee_pose", fieldPath: "pose.position.z", enabled: false },
      ],
    });

    expect(series.map((entry) => [entry.label, entry.rampIndex, entry.enabled, entry.emphasis])).toEqual([
      ["This tablet", 1, true, false],
      ["twist.linear.x", 1, true, true],
      ["pose.position.z", 3, false, false],
    ]);
    expect(series[0]?.key).toBe(plotSeriesKey("/joystick_cartesian_command", "twist.linear.x"));
  });

  it("reads the entries that moved elsewhere", () => {
    expect(readPlotUnavailable({ unavailable: [{ label: "Joint states", note: "moved to Bloom Debug" }, {}] })).toEqual(
      [{ label: "Joint states", note: "moved to Bloom Debug" }],
    );
  });
});

describe("the command sources verdict", () => {
  const board = (tablet: number, servo: number, output: number, age = 100) => [
    { emphasis: false, label: "This tablet", samples: [at(age, tablet)] },
    { emphasis: false, label: "Visual servoing", samples: [at(age, servo)] },
    { emphasis: true, label: "Manager output", samples: [at(age, output)] },
  ];

  it("names the source the output follows", () => {
    expect(resolvePlotVerdict(board(0.6, 0, 0.6), NOW)).toEqual({ active: ["This tablet"], kind: "driving" });
    expect(resolvePlotVerdict(board(0.3, 0.2, 0.5), NOW)).toEqual({
      active: ["This tablet", "Visual servoing"],
      kind: "driving",
    });
  });

  it("says nothing is commanding when the output is still or stale", () => {
    expect(resolvePlotVerdict(board(0, 0, 0), NOW)).toEqual({ active: [], kind: "idle" });
    expect(resolvePlotVerdict(board(0.6, 0, 0.6, 2000), NOW)).toEqual({ active: [], kind: "idle" });
  });

  it("flags an output no plotted source explains", () => {
    expect(resolvePlotVerdict(board(0, 0, 0.4), NOW)).toEqual({ active: [], kind: "unexplained" });
  });

  it("states no verdict on a board without an emphasised series", () => {
    expect(resolvePlotVerdict([{ emphasis: false, label: "Speed", samples: [at(0, 1)] }], NOW)).toBeNull();
  });
});
