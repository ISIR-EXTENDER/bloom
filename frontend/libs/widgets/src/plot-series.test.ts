import { describe, expect, it } from "vitest";

import designSystemPage from "../../../../docs/design/design-system.html?raw";

import {
  appendPlotSeriesSample,
  plotSeriesKey,
  readPlotSeries,
  readPlotUnavailable,
  readTwistMagnitude,
  resolvePlotVerdict,
  SERIES_RAMP,
} from "./plot-series";

const NOW = Date.parse("2026-09-17T10:00:00.000Z");
const at = (msAgo: number, value: number) => ({ time: NOW - msAgo, value });

describe("plot series samples", () => {
  const message = (data: number) => ({ receivedAt: "", topic: "/speed", value: { data } });
  const settings = { fieldPath: "data", historySeconds: 1, maxSamples: 2, minSpacingMs: 33 };

  it("keeps the newest sample of each spacing slot", () => {
    const samples = [0, 10, 20, 40].reduce(
      (kept, time) => appendPlotSeriesSample(kept, message(time), { ...settings, receivedAtMs: time }),
      [] as ReturnType<typeof appendPlotSeriesSample>,
    );

    expect(samples).toEqual([
      { time: 20, value: 20 },
      { time: 40, value: 40 },
    ]);
  });

  it("trims by time, with max_samples only a floor under what the window needs", () => {
    const samples = [0, 500, 1000, 1500].reduce(
      (kept, time) => appendPlotSeriesSample(kept, message(time), { ...settings, receivedAtMs: time }),
      [] as ReturnType<typeof appendPlotSeriesSample>,
    );

    expect(samples.map((sample) => sample.time)).toEqual([500, 1000, 1500]);
  });
});

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

  it("counts motion on an axis the board does not plot", () => {
    // The operator drives only Z: linear.x reads zero on every series, the twists do not.
    const zOnly = (activity: number) => [{ activity, time: NOW - 100, value: 0 }];
    const series = [
      { emphasis: false, label: "This tablet", samples: zOnly(0.4) },
      { emphasis: false, label: "Visual servoing", samples: zOnly(0) },
      { emphasis: true, label: "Manager output", samples: zOnly(0.4) },
    ];

    expect(resolvePlotVerdict(series, NOW)).toEqual({ active: ["This tablet"], kind: "driving" });
  });

  it("reads a twist's magnitude from a stamped or bare message, and nothing from other messages", () => {
    const sample = appendPlotSeriesSample(
      [],
      {
        receivedAt: "",
        topic: "/cmd",
        value: { twist: { linear: { x: 0, y: 0, z: 0.3 }, angular: { x: 0, y: 0, z: 0.4 } } },
      },
      { fieldPath: "twist.linear.x", historySeconds: 30, maxSamples: 900, receivedAtMs: NOW },
    );

    expect(sample).toEqual([{ activity: 0.5, time: NOW, value: 0 }]);
    expect(readTwistMagnitude({ linear: { x: -0.6 }, angular: {} })).toBeCloseTo(0.6);
    expect(readTwistMagnitude({ pose: { position: { z: 1 } } })).toBeUndefined();
  });

  it("flags an output no plotted source explains", () => {
    expect(resolvePlotVerdict(board(0, 0, 0.4), NOW)).toEqual({ active: [], kind: "unexplained" });
  });

  it("states no verdict on a board without an emphasised series", () => {
    expect(resolvePlotVerdict([{ emphasis: false, label: "Speed", samples: [at(0, 1)] }], NOW)).toBeNull();
  });
});
