import type { ScreenConfig, WidgetConfig } from "@bloom/api-client";
import type { PlotSeriesSnapshot, WidgetDataSnapshot } from "@bloom/widget-renderers";
import { appendPlotSeriesSample, PLOT_SAMPLE_SPACING_MS, readPlotSeries, type TopicMessage } from "@bloom/widgets";
import { useCallback, useEffect, useState } from "react";

import type { RuntimeTopicSubscriptionRequest } from "./runtime-action-dispatcher";

/** Series visibility a picker chose, per board: series key → shown. */
export type PlotSelections = Readonly<Record<string, Readonly<Record<string, boolean>>>>;

const SERIES_KINDS = new Set(["plot-board", "value-strip"]);
const STORAGE_KEY = "bloom.plot-selections.v1";

export function isSeriesWidget(widget: WidgetConfig): boolean {
  return SERIES_KINDS.has(widget.kind);
}

/** Every topic a series widget reads, for the screen's topic index. */
export function seriesTopics(widget: WidgetConfig): string[] {
  return isSeriesWidget(widget) ? readPlotSeries(widget.settings).map((series) => series.topic) : [];
}

/**
 * One subscription per topic. Samples carry the whole message and each series reads its own field, so a second
 * subscription to the same topic would only deliver every sample twice.
 */
export function createSeriesSubscriptionRequests(
  screen: ScreenConfig,
  alreadyRequested: readonly RuntimeTopicSubscriptionRequest[],
): RuntimeTopicSubscriptionRequest[] {
  const topics = new Set(alreadyRequested.map((request) => request.topic));
  return screen.widgets.filter(isSeriesWidget).flatMap((widget) =>
    readPlotSeries(widget.settings).flatMap((series) => {
      if (topics.has(series.topic)) {
        return [];
      }
      topics.add(series.topic);
      return [
        {
          type: "subscribe_topic" as const,
          topic: series.topic,
          message_type: series.messageType,
          field_path: "",
          widget_id: `${widget.id}:${series.topic}`,
        },
      ];
    }),
  );
}

/** Samples are timed on arrival here, not by the backend's `received_at`: the tablet clock may be skewed. */
export function appendSeriesSample(
  current: WidgetDataSnapshot | undefined,
  widget: WidgetConfig,
  message: TopicMessage,
  receivedAtMs = Date.now(),
): WidgetDataSnapshot | null {
  const configs = readPlotSeries(widget.settings);
  if (!configs.some((series) => series.topic === message.topic)) {
    return null;
  }
  const board = widget.kind === "plot-board";
  const historySeconds = board ? readPositive(widget.settings.history_seconds, 30) : 1;
  const maxSamples = board ? readPositive(widget.settings.max_samples, 900) : 1;
  const previous = current?.type === "plot-series" ? current.series : [];
  return {
    type: "plot-series",
    series: configs.map((config): PlotSeriesSnapshot => {
      const samples = previous.find((entry) => entry.key === config.key)?.samples ?? [];
      return {
        ...config,
        samples:
          config.topic === message.topic
            ? appendPlotSeriesSample(samples, message, {
                fieldPath: config.fieldPath,
                historySeconds,
                maxSamples,
                minSpacingMs: board ? PLOT_SAMPLE_SPACING_MS : 0,
                receivedAtMs,
              })
            : samples,
      };
    }),
  };
}

/** Boards take the picker's choices over each series' `enabled`; a picker receives its board's series. */
export function applyPlotSelections(
  screen: ScreenConfig,
  data: Readonly<Record<string, WidgetDataSnapshot>>,
  selections: PlotSelections,
): Record<string, WidgetDataSnapshot> {
  const merged: Record<string, WidgetDataSnapshot> = { ...data };
  for (const widget of screen.widgets) {
    if (widget.kind !== "plot-board") {
      continue;
    }
    const current = data[widget.id];
    const series =
      current?.type === "plot-series" ? current.series : readPlotSeries(widget.settings).map(withNoSamples);
    const chosen = selections[widget.id] ?? {};
    merged[widget.id] = {
      type: "plot-series",
      series: series.map((entry) => ({ ...entry, enabled: chosen[entry.key] ?? entry.enabled })),
    };
  }
  for (const widget of screen.widgets) {
    if (widget.kind !== "plot-picker") {
      continue;
    }
    const board = merged[String(widget.settings.plot_id ?? "")];
    if (board?.type === "plot-series") {
      merged[widget.id] = board;
    }
  }
  return merged;
}

/** Picker choices, kept per app and profile for boards with `picker.persist_per_profile`. */
export function usePlotSelections(screen: ScreenConfig, storageScope: string) {
  const [selections, setSelections] = useState<PlotSelections>(() => readStoredSelections(storageScope));

  useEffect(() => {
    setSelections(readStoredSelections(storageScope));
  }, [storageScope]);

  const toggle = useCallback(
    (plotId: string, seriesKey: string) => {
      const board = screen.widgets.find((widget) => widget.id === plotId && widget.kind === "plot-board");
      const series = board ? readPlotSeries(board.settings).find((entry) => entry.key === seriesKey) : undefined;
      if (!board || !series) {
        return;
      }
      setSelections((current) => {
        const shown = current[plotId]?.[seriesKey] ?? series.enabled;
        const next = { ...current, [plotId]: { ...current[plotId], [seriesKey]: !shown } };
        if (readPersist(board)) {
          writeStoredSelections(storageScope, plotId, next[plotId] ?? {});
        }
        return next;
      });
    },
    [screen.widgets, storageScope],
  );

  return { selections, toggle };
}

function readStoredSelections(storageScope: string): PlotSelections {
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
    const scoped = stored?.[storageScope];
    return scoped && typeof scoped === "object" ? scoped : {};
  } catch {
    return {};
  }
}

function writeStoredSelections(storageScope: string, plotId: string, choices: Readonly<Record<string, boolean>>) {
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") ?? {};
    stored[storageScope] = { ...stored[storageScope], [plotId]: choices };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Storage is a convenience; the choice still applies for this session.
  }
}

function readPersist(board: WidgetConfig): boolean {
  const picker = board.settings.picker;
  return !(
    typeof picker === "object" &&
    picker !== null &&
    (picker as Record<string, unknown>).persist_per_profile === false
  );
}

function readPositive(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function withNoSamples(config: ReturnType<typeof readPlotSeries>[number]): PlotSeriesSnapshot {
  return { ...config, samples: [] };
}
