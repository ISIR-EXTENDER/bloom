import type { TopicEchoSettings, TopicPlotSettings } from "./settings";

export type TopicMessage = {
  receivedAt: string;
  topic: string;
  value: unknown;
};

export type TopicPlotSample = {
  timestamp: string;
  value: number;
};

export type FieldPathSegment = string | number;

export function appendTopicEchoMessage(
  messages: readonly TopicMessage[],
  message: TopicMessage,
  settings: Pick<TopicEchoSettings, "fieldPath" | "maxMessages">,
): TopicMessage[] {
  const value =
    settings.fieldPath.trim().length > 0 ? resolveFieldPath(message.value, settings.fieldPath) : message.value;
  return [...messages, { ...message, value }].slice(-settings.maxMessages);
}

export function appendTopicPlotSample(
  samples: readonly TopicPlotSample[],
  message: TopicMessage,
  settings: Pick<TopicPlotSettings, "fieldPath" | "historySeconds" | "maxSamples">,
): TopicPlotSample[] {
  const value = resolveFieldPath(message.value, settings.fieldPath);
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return [...samples].slice(-settings.maxSamples);
  }

  const nextSamples = [...samples, { timestamp: message.receivedAt, value }];
  return trimTopicPlotSamples(nextSamples, settings);
}

export function formatTopicEchoValue(value: unknown, prettyPrint: boolean): string {
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value, null, prettyPrint ? 2 : 0);
}

export function resolveFieldPath(value: unknown, path: string): unknown {
  const segments = parseFieldPath(path);
  return segments.reduce<unknown>((currentValue, segment) => {
    if (typeof segment === "number") {
      return Array.isArray(currentValue) ? currentValue[segment] : undefined;
    }
    if (isRecord(currentValue)) {
      return currentValue[segment];
    }
    return undefined;
  }, value);
}

export function parseFieldPath(path: string): FieldPathSegment[] {
  return path
    .trim()
    .split(".")
    .filter((segment) => segment.length > 0)
    .flatMap(parseFieldPathSegment);
}

function parseFieldPathSegment(segment: string): FieldPathSegment[] {
  const parts: FieldPathSegment[] = [];
  const fieldMatch = segment.match(/^[^[]+/);
  if (fieldMatch?.[0]) {
    parts.push(fieldMatch[0]);
  }

  const indexMatches = segment.matchAll(/\[(\d+)\]/g);
  for (const match of indexMatches) {
    const index = Number(match[1]);
    if (Number.isInteger(index)) {
      parts.push(index);
    }
  }

  return parts;
}

function trimTopicPlotSamples(
  samples: readonly TopicPlotSample[],
  settings: Pick<TopicPlotSettings, "historySeconds" | "maxSamples">,
): TopicPlotSample[] {
  const latestSample = samples.at(-1);
  if (!latestSample) {
    return [];
  }

  const latestTime = Date.parse(latestSample.timestamp);
  if (!Number.isFinite(latestTime)) {
    return [...samples].slice(-settings.maxSamples);
  }

  const oldestAllowedTime = latestTime - settings.historySeconds * 1000;
  return samples
    .filter((sample) => {
      const sampleTime = Date.parse(sample.timestamp);
      return Number.isFinite(sampleTime) && sampleTime >= oldestAllowedTime;
    })
    .slice(-settings.maxSamples);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
