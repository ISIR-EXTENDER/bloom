import {
  getBooleanSetting,
  getNumberSetting,
  getStringSetting,
  type PlotVerdict,
  readPlotSeries,
  readPlotUnavailable,
  resolvePlotVerdict,
} from "@bloom/widgets";
import type { CSSProperties } from "react";
import { formatSignedValue } from "./readouts";
import type { PlotSeriesSnapshot, WidgetRendererProps } from "./types";
import { STALE_VALUE_AFTER_MS, useNow } from "./use-now";

const PLOT_EXTENT = 1000;
const RAMP_SIZE = 8;

export function PlotBoardWidget({ data, descriptor }: WidgetRendererProps) {
  const settings = descriptor.widget.settings;
  const historySeconds = Math.max(1, getNumberSetting(settings, "history_seconds", 30));
  const declaredMin = getNumberSetting(settings, "y_min", -1);
  const declaredMax = Math.max(declaredMin + 1e-6, getNumberSetting(settings, "y_max", 1));
  const series = resolveSeries(data, settings);
  const plotted = series.filter((entry) => entry.enabled);
  const now = useNow(250);
  const verdict = resolvePlotVerdict(series, now);
  const windowStart = now - historySeconds * 1000;
  const [yMin, yMax] = getBooleanSetting(settings, "y_fit_data", true)
    ? fitRange(declaredMin, declaredMax, plotted, windowStart)
    : [declaredMin, declaredMax];
  // The clock ticks every 250 ms, so a sample can arrive after `now`; it belongs at the right edge, not past it.
  const toX = (time: number) => Math.min(PLOT_EXTENT, ((time - windowStart) / (historySeconds * 1000)) * PLOT_EXTENT);
  const toY = (value: number) => ((yMax - Math.min(yMax, Math.max(yMin, value))) / (yMax - yMin)) * PLOT_EXTENT;
  const zeroY = yMin < 0 && yMax > 0 ? toY(0) : null;

  return (
    <div className="bloom-plot-board bloom-info-card">
      <header className="bloom-widget-head">
        <div className="bloom-plot-board-title">
          <strong>{descriptor.widget.title}</strong>
          <span className="bloom-widget-readout">
            {plotted.length} series · −{historySeconds} s → now
          </span>
        </div>
        {verdict ? (
          <output aria-live="polite" className="bloom-plot-board-verdict" data-verdict={verdict.kind}>
            {formatVerdict(verdict)}
          </output>
        ) : null}
      </header>
      <div className="bloom-plot-board-area">
        <svg
          aria-label={`${descriptor.widget.title}: ${plotted.map((entry) => entry.label).join(", ") || "no series selected"}`}
          preserveAspectRatio="none"
          role="img"
          viewBox={`0 0 ${PLOT_EXTENT} ${PLOT_EXTENT}`}
        >
          <path
            className="bloom-plot-board-grid"
            d="M250 0V1000M500 0V1000M750 0V1000M0 250H1000M0 750H1000"
            vectorEffect="non-scaling-stroke"
          />
          {zeroY !== null ? (
            <path
              className="bloom-plot-board-zero"
              d={`M0 ${zeroY}H${PLOT_EXTENT}`}
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          {plotted.map((entry) => {
            const points = entry.samples
              .filter((sample) => sample.time >= windowStart)
              .map(
                (sample, index) =>
                  `${index === 0 ? "M" : "L"}${toX(sample.time).toFixed(1)} ${toY(sample.value).toFixed(1)}`,
              );
            return points.length > 0 ? (
              <path
                className="bloom-plot-board-line"
                d={points.join("")}
                data-emphasis={entry.emphasis ? "true" : undefined}
                data-series={entry.key}
                key={entry.key}
                strokeDasharray={entry.rampIndex >= RAMP_SIZE ? "8 6" : undefined}
                style={seriesColor(entry.rampIndex)}
                vectorEffect="non-scaling-stroke"
              />
            ) : null;
          })}
        </svg>
        <span className="bloom-plot-board-axis" data-edge="top">
          {formatBound(yMax)}
        </span>
        <span className="bloom-plot-board-axis" data-edge="bottom">
          {formatBound(yMin)}
        </span>
        <span className="bloom-plot-board-axis" data-edge="start">
          −{historySeconds} s
        </span>
        <span className="bloom-plot-board-axis" data-edge="end">
          now
        </span>
      </div>
    </div>
  );
}

export function PlotPickerWidget({ data, descriptor, onActionIntent }: WidgetRendererProps) {
  const settings = descriptor.widget.settings;
  const plotId = getStringSetting(settings, "plot_id", "");
  const showValue = getBooleanSetting(settings, "show_value", false);
  const unavailable = getBooleanSetting(settings, "show_unavailable", true) ? readPlotUnavailable(settings) : [];
  const series = data?.type === "plot-series" ? data.series : [];
  const now = useNow(1000);

  return (
    <div className="bloom-plot-picker bloom-info-card">
      {series.length === 0 && unavailable.length === 0 ? (
        <p className="bloom-plot-picker-empty">No plot board “{plotId}” on this screen.</p>
      ) : null}
      <ul aria-label={descriptor.widget.title} className="bloom-plot-picker-list">
        {series.map((entry) => (
          <li key={entry.key}>
            <button
              aria-pressed={entry.enabled}
              className="bloom-plot-picker-row"
              onClick={() =>
                onActionIntent?.({
                  type: "plot-series-toggle",
                  plotId,
                  seriesKey: entry.key,
                  widgetId: descriptor.widget.id,
                  widgetKind: descriptor.widget.kind,
                })
              }
              type="button"
            >
              <span aria-hidden="true" className="bloom-plot-picker-swatch" style={seriesColor(entry.rampIndex)} />
              <span className="bloom-plot-picker-text">
                <strong>{entry.label}</strong>
                <span>{showValue ? entry.topic : `${entry.topic} · ${shortFieldPath(entry.fieldPath)}`}</span>
              </span>
              {showValue && isStale(entry, now) ? <span className="bloom-value-stale">stale</span> : null}
              {showValue ? (
                <output className="bloom-plot-picker-value" data-stale={isStale(entry, now) || undefined}>
                  {formatLatest(entry)}
                </output>
              ) : null}
            </button>
          </li>
        ))}
        {unavailable.map((entry) => (
          <li key={entry.label}>
            <div aria-disabled="true" className="bloom-plot-picker-row" data-unavailable="true">
              <span aria-hidden="true" className="bloom-plot-picker-swatch" />
              <span className="bloom-plot-picker-text">
                <strong>{entry.label}</strong>
                <span>{entry.note}</span>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ValueStripWidget({ data, descriptor }: WidgetRendererProps) {
  const series = resolveSeries(data, descriptor.widget.settings);
  const now = useNow(1000);

  return (
    <ul aria-label={descriptor.widget.title} className="bloom-value-strip">
      {series.map((entry) => (
        <li
          className="bloom-info-card bloom-value-strip-card"
          data-stale={isStale(entry, now) || undefined}
          key={entry.key}
        >
          <strong>{entry.label}</strong>
          <span className="bloom-value-strip-topic">{entry.topic}</span>
          <output className="bloom-value-strip-number" style={seriesColor(entry.rampIndex)}>
            {formatLatest(entry)}
          </output>
          <span className="bloom-value-strip-unit">
            {entry.unit}
            {isStale(entry, now) ? <span className="bloom-value-stale"> stale</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

function isStale(entry: PlotSeriesSnapshot, now: number): boolean {
  const latest = entry.samples.at(-1);
  return latest !== undefined && now - latest.time > STALE_VALUE_AFTER_MS;
}

/** The declared range, widened with a little headroom on whichever side the visible data leaves it. */
function fitRange(
  declaredMin: number,
  declaredMax: number,
  plotted: readonly PlotSeriesSnapshot[],
  windowStart: number,
): [number, number] {
  let dataMin = declaredMin;
  let dataMax = declaredMax;
  for (const entry of plotted) {
    for (const sample of entry.samples) {
      if (sample.time >= windowStart) {
        dataMin = Math.min(dataMin, sample.value);
        dataMax = Math.max(dataMax, sample.value);
      }
    }
  }
  const headroom = (dataMax - dataMin) * 0.05;
  return [
    dataMin < declaredMin ? dataMin - headroom : declaredMin,
    dataMax > declaredMax ? dataMax + headroom : declaredMax,
  ];
}

function resolveSeries(data: WidgetRendererProps["data"], settings: Record<string, unknown>) {
  if (data?.type === "plot-series") {
    return data.series;
  }
  return readPlotSeries(settings).map((entry): PlotSeriesSnapshot => ({ ...entry, samples: [] }));
}

function seriesColor(rampIndex: number): CSSProperties {
  return { "--bloom-series-color": `var(--bloom-series-${(rampIndex % RAMP_SIZE) + 1})` } as CSSProperties;
}

function formatLatest(entry: PlotSeriesSnapshot): string {
  const latest = entry.samples.at(-1);
  return latest ? formatSignedValue(latest.value) : "—";
}

function formatBound(value: number): string {
  return `${value < 0 ? "−" : "+"}${Math.abs(value).toFixed(1)}`;
}

/** `twist.linear.x` reads as `linear.x`: the message wrapper says nothing the topic does not. */
function shortFieldPath(fieldPath: string): string {
  return fieldPath.split(".").slice(-2).join(".");
}

function formatVerdict(verdict: PlotVerdict): string {
  if (verdict.kind === "idle") {
    return "nothing is commanding";
  }
  if (verdict.kind === "unexplained") {
    return "an unplotted source is driving";
  }
  const names = verdict.active.map((label) => label.charAt(0).toLowerCase() + label.slice(1));
  return names.length === 1 ? `${names[0]} is driving` : `${names.join(" and ")} are driving`;
}
