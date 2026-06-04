import { normalizeWidgetSettings } from "@bloom/widgets";
import type { CSSProperties } from "react";
import { getBooleanSetting, getNumberSetting, getStringSetting } from "./settings-readers";
import type { WidgetRendererProps } from "./types";

const DEFAULT_PLOT_VALUES = [0.18, 0.34, 0.28, 0.52, 0.47, 0.68, 0.61, 0.79, 0.73, 0.88];
const EVENT_LOG_SEVERITIES = ["error", "info", "success", "warning"] as const;
const PLOT_VARIANTS = ["area", "bars", "sparkline"] as const;

type EventLogEntry = {
  detail: string;
  severity: (typeof EVENT_LOG_SEVERITIES)[number];
  summary: string;
  timestamp: string;
};

type PlotVariant = (typeof PLOT_VARIANTS)[number];

const DEFAULT_EVENT_LOG_ENTRIES: readonly EventLogEntry[] = [
  {
    detail: "Connect a runtime log source or configure static events for this screen.",
    severity: "info",
    summary: "No events yet",
    timestamp: "",
  },
];

export function EventLogWidget({ descriptor }: WidgetRendererProps) {
  const maxEntries = Math.max(1, Math.round(getNumberSetting(descriptor.widget.settings, "maxEntries", 20)));
  const showDetails = getBooleanSetting(descriptor.widget.settings, "show_details", false);
  const showTimestamps = getBooleanSetting(descriptor.widget.settings, "showTimestamps", true);
  const severityFilter = readStringArraySetting(descriptor.widget.settings.severityFilter);
  const entries = readEventLogEntries(descriptor.widget.settings.entries)
    .filter((entry) => severityFilter.length === 0 || severityFilter.includes(entry.severity))
    .slice(0, maxEntries);

  return (
    <div className="bloom-event-log-widget">
      <header className="bloom-display-header">
        <strong>{descriptor.widget.title}</strong>
        <span>{formatEventCount(entries.length)}</span>
      </header>
      <ol className="bloom-event-log-list">
        {entries.map((entry) => (
          <li className="bloom-event-log-entry" data-severity={entry.severity} key={createEventLogEntryKey(entry)}>
            <span aria-hidden="true" className="bloom-event-log-marker" />
            <div>
              <strong>{entry.summary}</strong>
              {showTimestamps && entry.timestamp ? <time dateTime={entry.timestamp}>{entry.timestamp}</time> : null}
              {showDetails && entry.detail ? <p>{entry.detail}</p> : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function createEventLogEntryKey(entry: EventLogEntry): string {
  return [entry.timestamp, entry.severity, entry.summary, entry.detail].join("|");
}

function formatEventCount(count: number): string {
  return count === 1 ? "1 event" : `${count} events`;
}

export function GaugeWidget({ descriptor }: WidgetRendererProps) {
  const min = getNumberSetting(descriptor.widget.settings, "min", 0);
  const max = getNumberSetting(descriptor.widget.settings, "max", 1);
  const value = clamp(getNumberSetting(descriptor.widget.settings, "value", min), min, max);
  const unit = getStringSetting(descriptor.widget.settings, "unit", "");
  const ratio = max > min ? (value - min) / (max - min) : 0;
  const percent = Math.round(ratio * 100);

  return (
    <div className="bloom-gauge-widget">
      <header className="bloom-display-header">
        <strong>{descriptor.widget.title}</strong>
        <span>{unit || "Gauge"}</span>
      </header>
      <meter
        aria-label={`${descriptor.widget.title}: ${formatNumber(value)}${unit ? ` ${unit}` : ""}`}
        className="sr-only"
        max={max}
        min={min}
        value={value}
      >
        {formatNumber(value)}
      </meter>
      <div
        aria-hidden="true"
        className="bloom-gauge-meter"
        style={{ "--bloom-gauge-percent": `${percent}%` } as CSSProperties}
      >
        <span>{formatNumber(value)}</span>
        {unit ? <small>{unit}</small> : null}
      </div>
      <div className="bloom-gauge-scale" aria-hidden="true">
        <span>{formatNumber(min)}</span>
        <span>{formatNumber(max)}</span>
      </div>
    </div>
  );
}

export function PlotWidget({ descriptor }: WidgetRendererProps) {
  const showLegend = getBooleanSetting(descriptor.widget.settings, "showLegend", true);
  const historySeconds = getNumberSetting(descriptor.widget.settings, "historySeconds", 10);
  const values = readNumberArraySetting(descriptor.widget.settings.samples) ?? DEFAULT_PLOT_VALUES;
  const variant = readPlotVariant(descriptor.widget.settings.variant);
  const unit = getStringSetting(descriptor.widget.settings, "unit", "");
  const yBounds = resolvePlotBounds(
    values,
    readOptionalNumberSetting(descriptor.widget.settings.yMin),
    readOptionalNumberSetting(descriptor.widget.settings.yMax),
  );
  const path = createSparklinePath(values, 220, 82, yBounds);
  const bars = createPlotBars(values, 220, 82, yBounds);
  const latestValue = values.at(-1) ?? 0;

  return (
    <div className="bloom-plot-widget" data-variant={variant}>
      <header className="bloom-display-header">
        <strong>{descriptor.widget.title}</strong>
        {showLegend ? <span>{historySeconds}s history</span> : null}
      </header>
      <svg aria-label={`${descriptor.widget.title} plot`} className="bloom-plot-sparkline" viewBox="0 0 220 82">
        <title>{descriptor.widget.title}</title>
        <path className="bloom-plot-gridline" d="M0 20 H220 M0 41 H220 M0 62 H220" />
        {variant === "bars" ? bars.map((bar) => <rect className="bloom-plot-bar" key={bar.key} {...bar.rect} />) : null}
        {variant === "area" ? <path className="bloom-plot-area" d={`${path} L220 82 L0 82 Z`} /> : null}
        {variant !== "bars" ? <path className="bloom-plot-line" d={path} /> : null}
      </svg>
      <output className="bloom-plot-readout" aria-live="polite">
        latest {formatNumber(latestValue)}
        {unit ? ` ${unit}` : ""}
      </output>
    </div>
  );
}

export function Robot3dWidget({ descriptor }: WidgetRendererProps) {
  const normalizedSettings = normalizeWidgetSettings("robot-3d", descriptor.widget.settings);
  const settings = normalizedSettings.success ? normalizedSettings.settings : descriptor.widget.settings;
  const jointStateTopic = getStringSetting(settings, "jointStateTopic", "/joint_states");
  const description = getStringSetting(settings, "description", "3D robot visualization extension point.");
  const showAxes = getBooleanSetting(settings, "showAxes", true);

  return (
    <div className="bloom-robot-3d-widget">
      <header className="bloom-display-header">
        <strong>{descriptor.widget.title}</strong>
        <span>{jointStateTopic}</span>
      </header>
      <div className="bloom-robot-3d-stage" aria-label={`${descriptor.widget.title} placeholder`} role="img">
        {showAxes ? (
          <div className="bloom-robot-3d-axes" aria-hidden="true">
            <span data-axis="x">X</span>
            <span data-axis="y">Y</span>
            <span data-axis="z">Z</span>
          </div>
        ) : null}
        <div className="bloom-robot-3d-arm" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
      <p>{description}</p>
    </div>
  );
}

function createSparklinePath(
  values: readonly number[],
  width: number,
  height: number,
  bounds: { max: number; min: number },
): string {
  if (values.length === 0) {
    return `M0 ${height}`;
  }

  const range = bounds.max - bounds.min || 1;
  return values
    .map((value, index) => {
      const x = values.length === 1 ? width : (index / (values.length - 1)) * width;
      const y = height - ((value - bounds.min) / range) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function createPlotBars(
  values: readonly number[],
  width: number,
  height: number,
  bounds: { max: number; min: number },
): Array<{ key: string; rect: { height: number; rx: number; width: number; x: number; y: number } }> {
  if (values.length === 0) {
    return [];
  }

  const range = bounds.max - bounds.min || 1;
  const gap = Math.min(6, width / values.length / 3);
  const barWidth = Math.max(2, width / values.length - gap);

  return values.map((value, index) => {
    const normalized = Math.max(0, Math.min(1, (value - bounds.min) / range));
    const barHeight = Math.max(2, normalized * height);
    const x = index * (width / values.length) + gap / 2;
    const y = height - barHeight;

    return {
      key: `${index}-${value}`,
      rect: {
        height: Number(barHeight.toFixed(2)),
        rx: 3,
        width: Number(barWidth.toFixed(2)),
        x: Number(x.toFixed(2)),
        y: Number(y.toFixed(2)),
      },
    };
  });
}

function resolvePlotBounds(
  values: readonly number[],
  configuredMin: number | undefined,
  configuredMax: number | undefined,
): { max: number; min: number } {
  const min = configuredMin ?? Math.min(...values);
  const max = configuredMax ?? Math.max(...values);

  return max > min ? { max, min } : { max: min + 1, min };
}

function readPlotVariant(value: unknown): PlotVariant {
  return typeof value === "string" && PLOT_VARIANTS.includes(value as PlotVariant) ? (value as PlotVariant) : "area";
}

function readOptionalNumberSetting(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readNumberArraySetting(value: unknown): number[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const values = value.filter(
    (candidate): candidate is number => typeof candidate === "number" && Number.isFinite(candidate),
  );
  return values.length > 0 ? values : null;
}

function readStringArraySetting(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((candidate): candidate is string => typeof candidate === "string");
}

function readEventLogEntries(value: unknown): readonly EventLogEntry[] {
  if (!Array.isArray(value)) {
    return DEFAULT_EVENT_LOG_ENTRIES;
  }

  const entries = value.flatMap((candidate) => {
    if (!isRecord(candidate)) {
      return [];
    }

    const summary = readString(candidate.summary, "");
    if (!summary) {
      return [];
    }

    return [
      {
        detail: readString(candidate.detail, ""),
        severity: readSeverity(candidate.severity),
        summary,
        timestamp: readString(candidate.timestamp, ""),
      },
    ];
  });

  return entries.length > 0 ? entries : DEFAULT_EVENT_LOG_ENTRIES;
}

function readSeverity(value: unknown): EventLogEntry["severity"] {
  return typeof value === "string" && isEventLogSeverity(value) ? value : "info";
}

function isEventLogSeverity(value: string): value is EventLogEntry["severity"] {
  return EVENT_LOG_SEVERITIES.includes(value as EventLogEntry["severity"]);
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
