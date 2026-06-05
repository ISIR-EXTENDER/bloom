import { formatTopicEchoValue } from "@bloom/widgets";
import { useState } from "react";
import { createPlotBars, createSparklinePath, formatPlotNumber, resolvePlotBounds } from "./plot-rendering";
import { getBooleanSetting, getStringSetting } from "./settings-readers";
import type { WidgetRendererProps } from "./types";

const TOPIC_PLOT_VARIANTS = ["area", "bars", "sparkline"] as const;

type TopicPlotVariant = (typeof TOPIC_PLOT_VARIANTS)[number];

export function TopicDebugWidget({ data, descriptor }: WidgetRendererProps) {
  const topic = getStringSetting(descriptor.widget.settings, "topic", "No topic configured");
  const fieldPath = getStringSetting(descriptor.widget.settings, "fieldPath", "");
  const showDetails = getBooleanSetting(descriptor.widget.settings, "show_details", true);

  if (descriptor.widget.kind === "topic-echo") {
    return <TopicEchoWidget data={data} descriptor={descriptor} showDetails={showDetails} topic={topic} />;
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
  data,
  descriptor,
  showDetails,
  topic,
}: WidgetRendererProps & { showDetails: boolean; topic: string }) {
  const messages = data?.type === "topic-echo" ? data.messages : [];
  const [copyStatus, setCopyStatus] = useState<"copied" | "failed" | "idle">("idle");
  const [hiddenMessageCount, setHiddenMessageCount] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [pausedMessages, setPausedMessages] = useState(messages);
  const visibleMessages = isPaused ? pausedMessages : messages.slice(hiddenMessageCount);
  const echoText =
    visibleMessages.length > 0
      ? visibleMessages.map((message) => formatTopicEchoValue(message.value, true)).join("\n---\n")
      : "Waiting for messages...";
  const handlePauseToggle = () => {
    if (!isPaused) {
      setPausedMessages(visibleMessages);
    }
    setIsPaused(!isPaused);
  };
  const handleClear = () => {
    setHiddenMessageCount(messages.length);
    setPausedMessages([]);
  };

  return (
    <div className="bloom-topic-debug-widget">
      <header className="bloom-topic-debug-header">
        <div>
          <strong>{descriptor.widget.title}</strong>
          {showDetails ? <span>{topic}</span> : null}
        </div>
        <div className="bloom-topic-debug-actions">
          <button
            aria-pressed={isPaused}
            className="bloom-topic-debug-action"
            disabled={messages.length === 0}
            onClick={handlePauseToggle}
            type="button"
          >
            {isPaused ? "Resume" : "Pause"}
          </button>
          <button
            className="bloom-topic-debug-action"
            disabled={visibleMessages.length === 0}
            onClick={handleClear}
            type="button"
          >
            Clear
          </button>
          <button
            className="bloom-topic-debug-action"
            disabled={visibleMessages.length === 0}
            onClick={() => copyTopicEchoText(echoText, setCopyStatus)}
            type="button"
          >
            Copy
          </button>
        </div>
      </header>
      <pre className="bloom-topic-echo">{echoText}</pre>
      {!showDetails ? <span className="bloom-topic-debug-summary">{visibleMessages.length} messages</span> : null}
      <span aria-live="polite" className="bloom-topic-debug-status">
        {copyStatus === "copied" ? "Copied to clipboard." : null}
        {copyStatus === "failed" ? "Copy failed." : null}
      </span>
    </div>
  );
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
    readOptionalNumberSetting(descriptor.widget.settings.yMin),
    readOptionalNumberSetting(descriptor.widget.settings.yMax),
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

function readOptionalNumberSetting(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
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
