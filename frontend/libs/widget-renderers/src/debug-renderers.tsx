import { formatTopicEchoValue } from "@bloom/widgets";
import { useState } from "react";
import { getBooleanSetting, getStringSetting } from "./settings-readers";
import type { WidgetRendererProps } from "./types";

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
  return (
    <div className="bloom-topic-plot-widget">
      <header className="bloom-topic-debug-header">
        <div>
          <strong>{descriptor.widget.title}</strong>
          {showDetails ? <span>{topic}</span> : null}
        </div>
        <span className="bloom-topic-debug-summary">{samples.length} samples</span>
      </header>
      <div className="bloom-topic-plot" data-sample-count={samples.length}>
        <span>
          {latestSample
            ? formatLatestSample(latestSample.value, getStringSetting(descriptor.widget.settings, "unit", ""))
            : "Waiting for samples..."}
        </span>
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
