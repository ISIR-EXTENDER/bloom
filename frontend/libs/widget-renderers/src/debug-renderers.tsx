import {
  formatTopicEchoValue,
  getBooleanSetting,
  getStringSetting,
  isRecord,
  localizeEmptyEcho,
  localizeOperatorText,
  readOptionalNumber,
  type TopicMessage,
} from "@bloom/widgets";
import { useState } from "react";
import { formatAge } from "./display-renderers";
import { createPlotBars, createSparklinePath, formatPlotNumber, resolvePlotBounds } from "./plot-rendering";
import type { WidgetRendererProps } from "./types";
import { isSampleStale, useNow } from "./use-now";

const TOPIC_PLOT_VARIANTS = ["area", "bars", "sparkline"] as const;

type TopicPlotVariant = (typeof TOPIC_PLOT_VARIANTS)[number];

export function TopicDebugWidget({ controlState, data, descriptor, language }: WidgetRendererProps) {
  const topic = getStringSetting(descriptor.widget.settings, "topic", "No topic configured");
  const fieldPath = getStringSetting(descriptor.widget.settings, "fieldPath", "");
  const showDetails = getBooleanSetting(descriptor.widget.settings, "show_details", true);

  if (descriptor.widget.kind === "topic-echo") {
    return (
      <TopicEchoWidget
        controlState={controlState}
        data={data}
        descriptor={descriptor}
        language={language}
        showDetails={showDetails}
        topic={topic}
      />
    );
  }

  if (descriptor.widget.kind === "topic-plot") {
    return (
      <TopicPlotWidget
        data={data}
        descriptor={descriptor}
        fieldPath={fieldPath}
        showDetails={showDetails}
        topic={topic}
      />
    );
  }

  return (
    <>
      <strong>{descriptor.widget.title}</strong>
      <span>{topic}</span>
      <span>{fieldPath ? `field: ${fieldPath}` : descriptor.definition.displayName}</span>
    </>
  );
}

function TopicEchoWidget({
  controlState,
  data,
  descriptor,
  language,
  showDetails,
  topic,
}: WidgetRendererProps & { showDetails: boolean; topic: string }) {
  const word = (text: string) => localizeOperatorText(text, language);
  const prettyPrint = getBooleanSetting(descriptor.widget.settings, "prettyPrint", true);
  const messages = data?.type === "topic-echo" ? data.messages : [];
  const [copyStatus, setCopyStatus] = useState<"copied" | "failed" | "idle">("idle");
  // The last message showing at Clear. A full buffer keeps its length, so a count would hide every newer message.
  const [clearedThrough, setClearedThrough] = useState<TopicMessage | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [pausedMessages, setPausedMessages] = useState(messages);
  const clearedIndex = clearedThrough ? messages.lastIndexOf(clearedThrough) : -1;
  const visibleMessages = isPaused ? pausedMessages : messages.slice(clearedIndex + 1);
  const latest = visibleMessages.at(-1);
  const echoText =
    visibleMessages.length > 0
      ? showDetails
        ? visibleMessages.map((message) => formatEchoMessage(message.value, prettyPrint)).join("\n---\n")
        : formatEchoMessage(latest?.value, prettyPrint)
      : `\u2014\n\n${localizeEmptyEcho(descriptor.widget.title.toLowerCase(), language)}`;
  // The active frame restamps the echo live (joystick-lab.md); before any twist it is still the next one's frame.
  const frameId = controlState?.commandFrameId || readFrameId(latest?.value);
  // Read from a ticker: computed during render the age freezes exactly when the stream stops, which is
  // when it matters, and the echo sits at "0 s ago" for as long as nothing else re-renders.
  const now = useNow(1000);
  // A TwistStamped always carries a frame, so showing the frame alone meant the echo never showed an
  // age and a command sent ten minutes ago read exactly like the one just sent. The age earns its
  // place in the row once it is old enough to mislead; until then the frame has the space.
  const age = latest ? formatAge(latest.receivedAt, now) : "nothing sent";
  const stale = isSampleStale(latest?.receivedAt, now);
  const headerNote = frameId ? (stale ? `${frameId} \u00b7 ${age}` : frameId) : age;
  const handlePauseToggle = () => {
    if (!isPaused) {
      setPausedMessages(visibleMessages);
    }
    setIsPaused(!isPaused);
  };
  const handleClear = () => {
    setClearedThrough(messages.at(-1) ?? null);
    setPausedMessages([]);
  };

  return (
    <div className="bloom-topic-debug-widget bloom-info-card" data-show-details={showDetails ? "true" : "false"}>
      <header className="bloom-widget-head">
        <strong>{descriptor.widget.title}</strong>
        <span className="bloom-widget-readout">{headerNote}</span>
      </header>
      {showDetails ? (
        <div className="bloom-topic-debug-actions">
          <span className="bloom-widget-topic">{topic}</span>
          <button
            aria-pressed={isPaused}
            className="bloom-topic-debug-action"
            disabled={messages.length === 0}
            onClick={handlePauseToggle}
            type="button"
          >
            {word(isPaused ? "Resume" : "Pause")}
          </button>
          <button
            className="bloom-topic-debug-action"
            disabled={visibleMessages.length === 0}
            onClick={handleClear}
            type="button"
          >
            {word("Clear")}
          </button>
          <button
            className="bloom-topic-debug-action"
            disabled={visibleMessages.length === 0}
            onClick={() => copyTopicEchoText(echoText, setCopyStatus)}
            type="button"
          >
            {word("Copy")}
          </button>
        </div>
      ) : null}
      <pre className="bloom-topic-echo" data-empty={visibleMessages.length === 0 ? "true" : undefined}>
        {echoText}
      </pre>
      {!showDetails ? <span className="sr-only">{visibleMessages.length} messages</span> : null}
      <span aria-live="polite" className="bloom-topic-debug-status">
        {copyStatus === "copied" ? word("Copied to clipboard.") : null}
        {copyStatus === "failed" ? word("Copy failed.") : null}
      </span>
    </div>
  );
}

const SIGNED = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value)
    ? `${value < -0.005 ? "\u2212" : "+"}${Math.abs(value).toFixed(2)}`
    : String(value);

/** Twists and joint states print the way an engineer reads them aloud; anything else prints as JSON. */
export function formatEchoMessage(value: unknown, prettyPrint = true): string {
  const twist = isRecord(value) && isRecord(value.twist) ? value.twist : value;
  if (isRecord(twist) && isRecord(twist.linear) && isRecord(twist.angular)) {
    const vector = (v: Record<string, unknown>) => `x ${SIGNED(v.x)}  y ${SIGNED(v.y)}  z ${SIGNED(v.z)}`;
    return `linear:\n  ${vector(twist.linear)}\nangular:\n  ${vector(twist.angular)}`;
  }
  if (isRecord(value) && Array.isArray(value.name) && Array.isArray(value.position)) {
    const names = value.name.map(String);
    const nameLine = names.length > 2 ? `${names[0]} \u2026 ${names.at(-1)}` : names.join(" ");
    const positions = value.position.map((position) => SIGNED(position)).join("\n  ");
    return `name:\n  ${nameLine}\nposition:\n  ${positions}`;
  }
  // The author asked for this on the widget; it was a required field that changed nothing.
  return formatTopicEchoValue(value, prettyPrint) ?? "(empty message)";
}

function readFrameId(value: unknown): string {
  if (isRecord(value) && isRecord(value.header) && typeof value.header.frame_id === "string") {
    return value.header.frame_id;
  }
  return "";
}

function TopicPlotWidget({
  data,
  descriptor,
  fieldPath,
  showDetails,
  topic,
}: WidgetRendererProps & { fieldPath: string; showDetails: boolean; topic: string }) {
  const samples = data?.type === "topic-plot" ? data.samples : [];
  const latestSample = samples.at(-1);
  const values = samples.map((sample) => sample.value);
  const variant = readTopicPlotVariant(descriptor.widget.settings.variant);
  const unit = getStringSetting(descriptor.widget.settings, "unit", "");
  const yBounds = resolvePlotBounds(
    values,
    readOptionalNumber(descriptor.widget.settings.yMin),
    readOptionalNumber(descriptor.widget.settings.yMax),
  );
  const path = createSparklinePath(values, 220, 82, yBounds);
  const bars = createPlotBars(values, 220, 82, yBounds);
  const formattedLatest = latestSample ? formatLatestSample(latestSample.value, unit) : "";

  return (
    <div className="bloom-topic-plot-widget" data-variant={variant}>
      <header className="bloom-topic-debug-header">
        <div>
          <strong>{descriptor.widget.title}</strong>
          {showDetails ? <span>{topic}</span> : null}
        </div>
        <span className="bloom-topic-debug-summary">{samples.length} samples</span>
      </header>
      <div className="bloom-topic-plot" data-sample-count={samples.length}>
        {samples.length > 0 ? (
          <>
            <svg
              aria-label={`${descriptor.widget.title} live topic plot`}
              className="bloom-topic-plot-sparkline"
              role="img"
              viewBox="0 0 220 82"
            >
              <title>{`${descriptor.widget.title} telemetry shape`}</title>
              <path className="bloom-plot-gridline" d="M0 20 H220 M0 41 H220 M0 62 H220" />
              {variant === "bars"
                ? bars.map((bar) => <rect className="bloom-plot-bar" key={bar.key} {...bar.rect} />)
                : null}
              {variant === "area" ? <path className="bloom-plot-area" d={`${path} L220 82 L0 82 Z`} /> : null}
              {variant !== "bars" ? <path className="bloom-plot-line" d={path} /> : null}
            </svg>
            <output aria-live="polite" className="bloom-topic-plot-readout">
              {formattedLatest}
            </output>
            <span className="bloom-topic-plot-range">
              {formatPlotNumber(yBounds.min)}
              {unit ? ` ${unit}` : ""} {"->"} {formatPlotNumber(yBounds.max)}
              {unit ? ` ${unit}` : ""}
            </span>
          </>
        ) : (
          <span>Waiting for samples...</span>
        )}
      </div>
      {showDetails ? <span>{fieldPath ? `field: ${fieldPath}` : descriptor.definition.displayName}</span> : null}
    </div>
  );
}

function formatLatestSample(value: number, unit: string): string {
  const formattedValue = Number.isInteger(value)
    ? value.toString()
    : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  return unit ? `${formattedValue} ${unit}` : formattedValue;
}

function readTopicPlotVariant(value: unknown): TopicPlotVariant {
  return typeof value === "string" && TOPIC_PLOT_VARIANTS.includes(value as TopicPlotVariant)
    ? (value as TopicPlotVariant)
    : "area";
}

async function copyTopicEchoText(
  text: string,
  setCopyStatus: (status: "copied" | "failed" | "idle") => void,
): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    setCopyStatus("copied");
  } catch {
    setCopyStatus("failed");
  }
}
