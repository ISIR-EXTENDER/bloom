import { resolveFieldPath, type TopicMessage } from "./telemetry";

/** The design system's series ramp (design-system §05). A seed colour naming one of these keeps its slot. */
export const SERIES_RAMP = ["#31493f", "#7e967e", "#c98a7e", "#536960", "#8a7f5c", "#6b7f8a", "#8a6b7f", "#5c7d6b"];

export type PlotSeriesConfig = {
  emphasis: boolean;
  enabled: boolean;
  fieldPath: string;
  /** Stable identity for selection and samples: topic and field. */
  key: string;
  label: string;
  messageType: string;
  /** Ramp position; past the ramp the colour repeats dashed. */
  rampIndex: number;
  topic: string;
  unit: string;
};

/** Timed in the browser that received it: a backend stamp read against a skewed tablet clock falls off the window. */
export type PlotSeriesSample = { time: number; value: number };

export type PlotUnavailableEntry = { label: string; note: string };

export function plotSeriesKey(topic: string, fieldPath: string): string {
  return `${topic}#${fieldPath}`;
}

export function readPlotSeries(settings: Record<string, unknown>): PlotSeriesConfig[] {
  const raw = Array.isArray(settings.series) ? settings.series : [];
  return raw.flatMap((entry, index) => {
    if (!isRecord(entry)) {
      return [];
    }
    const topic = readString(entry.topic);
    const fieldPath = readString(entry.field_path) || readString(entry.fieldPath);
    if (!topic.startsWith("/") || !fieldPath) {
      return [];
    }
    const color = readString(entry.color).toLowerCase();
    const rampIndex = SERIES_RAMP.indexOf(color);
    return [
      {
        emphasis: entry.emphasis === true,
        enabled: entry.enabled !== false,
        fieldPath,
        key: plotSeriesKey(topic, fieldPath),
        label: readString(entry.label) || fieldPath,
        messageType: readString(entry.message_type) || readString(entry.messageType),
        rampIndex: rampIndex >= 0 ? rampIndex : index,
        topic,
        unit: readString(entry.unit),
      },
    ];
  });
}

export function readPlotUnavailable(settings: Record<string, unknown>): PlotUnavailableEntry[] {
  const raw = Array.isArray(settings.unavailable) ? settings.unavailable : [];
  return raw.flatMap((entry) =>
    isRecord(entry) && readString(entry.label)
      ? [{ label: readString(entry.label), note: readString(entry.note) }]
      : [],
  );
}

export function appendPlotSeriesSample(
  samples: readonly PlotSeriesSample[],
  message: TopicMessage,
  settings: { fieldPath: string; historySeconds: number; maxSamples: number; receivedAtMs: number },
): PlotSeriesSample[] {
  const raw = resolveFieldPath(message.value, settings.fieldPath);
  // A flag plots as 1 or 0, so a fault reads on the same axis as everything else.
  const value = typeof raw === "boolean" ? Number(raw) : raw;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return [...samples];
  }
  const oldestAllowed = settings.receivedAtMs - settings.historySeconds * 1000;
  const next = [...samples, { time: settings.receivedAtMs, value }];
  const firstKept = next.findIndex((sample) => sample.time >= oldestAllowed);
  return next.slice(Math.max(firstKept, next.length - settings.maxSamples));
}

export type PlotVerdict = { active: readonly string[]; kind: "driving" | "idle" | "unexplained" };

const ACTIVE_THRESHOLD = 0.01;
/** Inputs expire in the manager after 0.2 s; a source quiet for longer is not commanding. */
const STALE_AFTER_MS = 500;

/**
 * Which source the emphasised series (the manager output) is following. Null when the board has no
 * emphasised series, so a plain feedback board states no verdict.
 */
export function resolvePlotVerdict(
  series: readonly { emphasis: boolean; label: string; samples: readonly PlotSeriesSample[] }[],
  now: number,
): PlotVerdict | null {
  const output = series.find((entry) => entry.emphasis);
  if (!output) {
    return null;
  }
  const isActive = (samples: readonly PlotSeriesSample[]) => {
    const latest = samples.at(-1);
    return latest !== undefined && now - latest.time <= STALE_AFTER_MS && Math.abs(latest.value) > ACTIVE_THRESHOLD;
  };
  if (!isActive(output.samples)) {
    return { active: [], kind: "idle" };
  }
  const active = series.filter((entry) => !entry.emphasis && isActive(entry.samples)).map((entry) => entry.label);
  return { active, kind: active.length > 0 ? "driving" : "unexplained" };
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
