import {
  clamp,
  getBooleanSetting,
  getNumberSetting,
  getStringSetting,
  hidesTitle,
  isRecord,
  normalizeWidgetSettings,
  readOptionalNumber,
  readString,
} from "@bloom/widgets";
import { type CSSProperties, useState } from "react";
import { createPlotBars, createSparklinePath, formatPlotNumber, resolvePlotBounds } from "./plot-rendering";
import type { WidgetRendererProps } from "./types";
import { isSampleStale, useNow } from "./use-now";

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

export function EventLogWidget({ data, descriptor }: WidgetRendererProps) {
  const settings = descriptor.widget.settings;
  const maxEntries = Math.max(1, Math.round(getNumberSetting(settings, "maxEntries", 20)));
  const showDetails = getBooleanSetting(settings, "show_details", false);
  const showTimestamps = getBooleanSetting(settings, "showTimestamps", true);
  const newestFirst = getBooleanSetting(settings, "newest_first", true);
  const topic = getStringSetting(settings, "topic", "");
  const notes = isRecord(settings.notes) ? settings.notes : {};
  const severityFilter = readStringArraySetting(settings.severityFilter);
  const runtimeEntries = data?.type === "event-log" ? data.messages.map(toRuntimeEventLogEntry) : [];
  const orderedRuntime = newestFirst ? [...runtimeEntries].reverse() : runtimeEntries;
  // Authored entries are a placeholder for a log with no source yet, never mixed into live events.
  const entries = (orderedRuntime.length > 0 ? orderedRuntime : readEventLogEntries(settings.entries))
    .filter((entry) => severityFilter.length === 0 || severityFilter.includes(entry.severity))
    .slice(0, maxEntries);

  return (
    <div className="bloom-event-log-widget bloom-info-card">
      {hidesTitle(descriptor.widget.settings) ? null : (
        <header className="bloom-widget-head">
          <strong>{descriptor.widget.title}</strong>
          <span className="bloom-widget-readout">
            {topic ? `${topic}${newestFirst ? " \u00b7 newest first" : ""}` : formatEventCount(entries.length)}
          </span>
        </header>
      )}
      <ol className="bloom-event-log-list">
        {entries.map((entry) => {
          const note = readString(notes[entry.summary], "") || (showDetails ? entry.detail : "");
          return (
            <li className="bloom-event-log-entry" data-severity={entry.severity} key={createEventLogEntryKey(entry)}>
              <span aria-hidden="true" className="bloom-event-log-marker" />
              {showTimestamps && entry.timestamp ? (
                <time className="bloom-event-log-age" dateTime={entry.timestamp}>
                  {formatAge(entry.timestamp)}
                </time>
              ) : null}
              <strong>{entry.summary}</strong>
              {note ? <p>{note}</p> : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** "12 s ago", "2 min ago": how long, not when; the operator reads freshness. */
export function formatAge(timestamp: string, now = Date.now()): string {
  const time = new Date(timestamp).getTime();
  if (Number.isNaN(time)) {
    return timestamp;
  }
  const seconds = Math.max(0, Math.round((now - time) / 1000));
  if (seconds < 60) {
    return `${seconds} s ago`;
  }
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes} min ago` : `${Math.round(minutes / 60)} h ago`;
}

function createEventLogEntryKey(entry: EventLogEntry): string {
  return [entry.timestamp, entry.severity, entry.summary, entry.detail].join("|");
}

function formatEventCount(count: number): string {
  return count === 1 ? "1 event" : `${count} events`;
}

export function GaugeWidget({ data, descriptor }: WidgetRendererProps) {
  const min = getNumberSetting(descriptor.widget.settings, "min", 0);
  const max = getNumberSetting(descriptor.widget.settings, "max", 1);
  // An authored value is a placeholder for the builder, never a reading. Drawn the same as a live one it
  // becomes a claim about the robot: a gauge with no topic at all read "Battery 76 %" to a participant.
  const hasSample = data?.type === "gauge";
  // A sample that stopped arriving is not a reading either: the number is where the value was.
  const stale = isSampleStale(hasSample ? data.receivedAt : undefined, useNow(1000));
  const live = hasSample && !stale;
  // A stale sample is still the robot's last word; it is marked, not replaced by the placeholder.
  const value = clamp(hasSample ? data.value : getNumberSetting(descriptor.widget.settings, "value", min), min, max);
  const unit = getStringSetting(descriptor.widget.settings, "unit", "");
  const showDetails = getBooleanSetting(descriptor.widget.settings, "show_details", false);
  const ratio = max > min ? (value - min) / (max - min) : 0;
  const percent = Math.round(ratio * 100);

  return (
    <div className="bloom-gauge-widget" data-live={live ? "true" : "false"}>
      {hidesTitle(descriptor.widget.settings) ? null : (
        <header className="bloom-display-header">
          <strong>{descriptor.widget.title}</strong>
          <span>{showDetails && hasSample ? data.topic : unit || "Gauge"}</span>
        </header>
      )}
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
      {live ? (
        showDetails ? (
          <small className="bloom-display-source">updated {formatShortTimestamp(data.receivedAt)}</small>
        ) : null
      ) : (
        <small className="bloom-display-source">no source</small>
      )}
    </div>
  );
}

export function PlotWidget({ data, descriptor }: WidgetRendererProps) {
  const showLegend = getBooleanSetting(descriptor.widget.settings, "showLegend", true);
  const historySeconds = getNumberSetting(descriptor.widget.settings, "historySeconds", 10);
  const allowFreeze = getBooleanSetting(descriptor.widget.settings, "allow_freeze", true);
  const liveSamples = data?.type === "plot" ? data.samples : [];
  // Authored samples, and the default ramp behind them, are builder scaffolding. Drawn like a live trace
  // they read as the robot's own history.
  const live = liveSamples.length > 0;
  const liveValues =
    liveSamples.length > 0
      ? liveSamples.map((sample) => sample.value)
      : (readNumberArraySetting(descriptor.widget.settings.samples) ?? DEFAULT_PLOT_VALUES);

  // A transient is unreadable on a live trace: by the time an operator has seen
  // a spike it has scrolled away. Freezing keeps the samples that were on
  // screen at the moment the button was pressed.
  const [frozenValues, setFrozenValues] = useState<number[] | null>(null);
  const isFrozen = frozenValues !== null;
  const values = frozenValues ?? liveValues;

  const handleFreezeToggle = () => {
    setFrozenValues(isFrozen ? null : [...liveValues]);
  };
  const variant = readPlotVariant(descriptor.widget.settings.variant);
  const unit = getStringSetting(descriptor.widget.settings, "unit", "");
  const showDetails = getBooleanSetting(descriptor.widget.settings, "show_details", false);
  const yBounds = resolvePlotBounds(
    values,
    readOptionalNumber(descriptor.widget.settings.yMin),
    readOptionalNumber(descriptor.widget.settings.yMax),
  );
  const path = createSparklinePath(values, 220, 82, yBounds);
  const bars = createPlotBars(values, 220, 82, yBounds);
  const latestValue = values.at(-1) ?? 0;

  return (
    <div className="bloom-plot-widget" data-live={live ? "true" : "false"} data-variant={variant}>
      {hidesTitle(descriptor.widget.settings) ? null : (
        <header className="bloom-display-header">
          <strong>{descriptor.widget.title}</strong>
          {showLegend ? (
            <span>{liveSamples.length > 0 ? `${liveSamples.length} samples` : `${historySeconds}s history`}</span>
          ) : null}
          {allowFreeze ? (
            <button
              aria-pressed={isFrozen}
              className="bloom-plot-freeze"
              data-frozen={isFrozen ? "true" : undefined}
              onClick={handleFreezeToggle}
              type="button"
            >
              {isFrozen ? "Live" : "Freeze"}
            </button>
          ) : null}
        </header>
      )}
      <svg aria-label={`${descriptor.widget.title} plot`} className="bloom-plot-sparkline" viewBox="0 0 220 82">
        <title>{descriptor.widget.title}</title>
        <path className="bloom-plot-gridline" d="M0 20 H220 M0 41 H220 M0 62 H220" />
        {variant === "bars" ? bars.map((bar) => <rect className="bloom-plot-bar" key={bar.key} {...bar.rect} />) : null}
        {variant === "area" ? <path className="bloom-plot-area" d={`${path} L220 82 L0 82 Z`} /> : null}
        {variant !== "bars" ? <path className="bloom-plot-line" d={path} /> : null}
      </svg>
      <output className="bloom-plot-readout" aria-live="polite">
        {isFrozen ? "frozen " : "latest "}
        {formatNumber(latestValue)}
        {unit ? ` ${unit}` : ""}
      </output>
      {live ? (
        showDetails ? (
          <small className="bloom-display-source">
            live from {getStringSetting(descriptor.widget.settings, "topic", "topic")}
          </small>
        ) : null
      ) : (
        <small className="bloom-display-source">no source</small>
      )}
    </div>
  );
}

export function Robot3dWidget({ data, descriptor }: WidgetRendererProps) {
  const normalizedSettings = normalizeWidgetSettings("robot-3d", descriptor.widget.settings);
  const settings = normalizedSettings.success ? normalizedSettings.settings : descriptor.widget.settings;
  const jointStateTopic = getStringSetting(settings, "jointStateTopic", "/joint_states");
  const description = getStringSetting(settings, "description", "3D robot visualization extension point.");
  const showAxes = getBooleanSetting(settings, "showAxes", true);
  const liveSummary = data?.type === "robot-3d" ? summarizeJointState(data.value) : "Waiting for joint states";

  return (
    <div className="bloom-robot-3d-widget">
      {hidesTitle(descriptor.widget.settings) ? null : (
        <header className="bloom-display-header">
          <strong>{descriptor.widget.title}</strong>
          <span>{jointStateTopic}</span>
        </header>
      )}
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
      <strong className="bloom-display-source">{liveSummary}</strong>
    </div>
  );
}

function readPlotVariant(value: unknown): PlotVariant {
  return typeof value === "string" && PLOT_VARIANTS.includes(value as PlotVariant) ? (value as PlotVariant) : "area";
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

function toRuntimeEventLogEntry(message: { receivedAt: string; value: unknown }): EventLogEntry {
  const value = message.value;
  if (isRecord(value)) {
    return {
      detail: JSON.stringify(value),
      severity: readRuntimeSeverity(value.level ?? value.severity),
      summary: readString(value.msg, readString(value.message, readString(value.data, "Runtime event received"))),
      timestamp: message.receivedAt,
    };
  }

  return {
    detail: typeof value === "string" ? value : JSON.stringify(value),
    severity: "info",
    summary: typeof value === "string" ? value : "Runtime event received",
    timestamp: message.receivedAt,
  };
}

function readRuntimeSeverity(value: unknown): EventLogEntry["severity"] {
  if (typeof value === "number") {
    if (value >= 40) {
      return "error";
    }
    if (value >= 30) {
      return "warning";
    }
    return "info";
  }
  return readSeverity(value);
}

function readSeverity(value: unknown): EventLogEntry["severity"] {
  return typeof value === "string" && isEventLogSeverity(value) ? value : "info";
}

function isEventLogSeverity(value: string): value is EventLogEntry["severity"] {
  return EVENT_LOG_SEVERITIES.includes(value as EventLogEntry["severity"]);
}

function formatNumber(value: number): string {
  return formatPlotNumber(value);
}

function formatShortTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function summarizeJointState(value: unknown): string {
  if (isRecord(value) && Array.isArray(value.name)) {
    return value.name.length === 1 ? "1 live joint" : `${value.name.length} live joints`;
  }
  return "Live joint state received";
}
