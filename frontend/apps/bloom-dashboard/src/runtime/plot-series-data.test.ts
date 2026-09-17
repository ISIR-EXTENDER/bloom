/**
 * @vitest-environment jsdom
 */
import type { ScreenConfig } from "@bloom/api-client";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  appendSeriesSample,
  applyPlotSelections,
  createSeriesSubscriptionRequests,
  usePlotSelections,
} from "./plot-series-data";

const series = [
  { topic: "/ee_velocity", field_path: "twist.linear.x", label: "End effector speed" },
  { topic: "/cartesian_command", field_path: "twist.linear.x", label: "Commanded X" },
  { topic: "/cartesian_command", field_path: "twist.angular.z", label: "Commanded RZ", enabled: false },
];

const feedback: ScreenConfig = {
  id: "manager_feedback",
  title: "Robot feedback",
  canvas: { preset_id: "native-1280x720", runtime_mode: "fit" },
  widgets: [
    {
      id: "feedback-plot",
      kind: "plot-board",
      title: "Plot board",
      layout: { x: 14, y: 50, width: 902, height: 400 },
      settings: { series, history_seconds: 30, max_samples: 900 },
    },
    {
      id: "feedback-values",
      kind: "value-strip",
      title: "Current values",
      layout: { x: 14, y: 462, width: 902, height: 200 },
      settings: { series },
    },
    {
      id: "feedback-picker",
      kind: "plot-picker",
      title: "Series",
      layout: { x: 928, y: 50, width: 338, height: 348 },
      settings: { plot_id: "feedback-plot" },
    },
  ],
};

const twist = (x: number, z: number, receivedAt: string) => ({
  receivedAt,
  topic: "/cartesian_command",
  value: { twist: { linear: { x }, angular: { z } } },
});

describe("plot series telemetry", () => {
  it("subscribes once per topic across every series widget", () => {
    const requests = createSeriesSubscriptionRequests(feedback, [
      { type: "subscribe_topic", topic: "/ee_velocity", message_type: "", field_path: "", widget_id: "gauge" },
    ]);

    expect(requests.map((request) => request.topic)).toEqual(["/cartesian_command"]);
    expect(requests[0]?.field_path).toBe("");
  });

  it("reads each series' own field from one message", () => {
    const board = feedback.widgets[0];
    if (!board) throw new Error("Missing board.");
    const first = appendSeriesSample(undefined, board, twist(0.4, -0.2, "2026-09-17T10:00:00.000Z"), 1_000);
    const second = appendSeriesSample(first ?? undefined, board, twist(0.5, 0.1, "2026-09-17T10:00:00.100Z"), 1_100);

    expect(second?.type === "plot-series" && second.series.map((entry) => entry.samples.map((s) => s.value))).toEqual([
      [],
      [0.4, 0.5],
      [-0.2, 0.1],
    ]);
    expect(appendSeriesSample(first ?? undefined, board, { ...twist(1, 1, ""), topic: "/joint_states" })).toBeNull();
  });

  it("keeps only the latest value for a value strip", () => {
    const strip = feedback.widgets[1];
    if (!strip) throw new Error("Missing strip.");
    const first = appendSeriesSample(undefined, strip, twist(0.4, 0, "2026-09-17T10:00:00.000Z"), 1_000);
    const second = appendSeriesSample(first ?? undefined, strip, twist(0.5, 0, "2026-09-17T10:00:00.100Z"), 1_100);

    expect(second?.type === "plot-series" && second.series[1]?.samples).toEqual([
      { activity: 0.5, time: 1_100, value: 0.5 },
    ]);
  });

  it("times samples by their arrival, whatever clock the backend stamped them with", () => {
    const board = feedback.widgets[0];
    if (!board) throw new Error("Missing board.");
    const arrived = Date.parse("2026-09-17T10:00:00.000Z");
    // The backend's clock runs 30 s ahead of this tablet's.
    const data = appendSeriesSample(undefined, board, twist(0.4, 0, "2026-09-17T10:00:30.000Z"), arrived);

    expect(data?.type === "plot-series" && data.series[1]?.samples).toEqual([
      { activity: 0.4, time: arrived, value: 0.4 },
    ]);
  });

  it("keeps the whole window of a 100 Hz command stream, however low max_samples is", () => {
    const board = feedback.widgets[0];
    if (!board) throw new Error("Missing board.");
    let data = appendSeriesSample(undefined, board, twist(0, 0, ""), 0);
    for (let time = 10; time <= 40_000; time += 10) {
      data = appendSeriesSample(data ?? undefined, board, twist(time / 40_000, 0, ""), time);
    }

    const samples = data?.type === "plot-series" ? (data.series[1]?.samples ?? []) : [];
    expect(samples.at(-1)).toEqual({ activity: 1, time: 40_000, value: 1 });
    expect(samples[0]?.time).toBeGreaterThanOrEqual(10_000);
    expect(samples[0]?.time).toBeLessThan(10_000 + 40);
    expect(samples.length).toBeLessThanOrEqual(912);
  });

  it("applies picker choices to the board and hands the picker the same series", () => {
    const merged = applyPlotSelections(
      feedback,
      {},
      { "feedback-plot": { "/cartesian_command#twist.angular.z": true } },
    );

    const board = merged["feedback-plot"];
    expect(board?.type === "plot-series" && board.series.map((entry) => entry.enabled)).toEqual([true, true, true]);
    expect(merged["feedback-picker"]).toBe(board);
  });
});

describe("picker choices", () => {
  afterEach(() => window.localStorage.clear());

  it("toggle from the series default and persist per profile", () => {
    const { result, rerender } = renderHook(({ scope }) => usePlotSelections(feedback, scope), {
      initialProps: { scope: "config:app:bench" },
    });

    act(() => result.current.toggle("feedback-plot", "/cartesian_command#twist.angular.z"));
    expect(result.current.selections).toEqual({ "feedback-plot": { "/cartesian_command#twist.angular.z": true } });

    rerender({ scope: "config:app:operator" });
    expect(result.current.selections).toEqual({});

    rerender({ scope: "config:app:bench" });
    expect(result.current.selections).toEqual({ "feedback-plot": { "/cartesian_command#twist.angular.z": true } });
  });

  it("ignore a series the board does not have", () => {
    const { result } = renderHook(() => usePlotSelections(feedback, "config:app:bench"));

    act(() => result.current.toggle("feedback-plot", "/nowhere#data"));
    expect(result.current.selections).toEqual({});
  });
});
