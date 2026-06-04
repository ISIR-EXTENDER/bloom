import { formatTopicEchoValue } from "@bloom/widgets";
import { useState } from "react";
import { getStringSetting } from "./settings-readers";
import type { WidgetRendererProps } from "./types";

export function TopicDebugWidget({ data, descriptor }: WidgetRendererProps) {
  const topic = getStringSetting(descriptor.widget.settings, "topic", "No topic configured");
  const fieldPath = getStringSetting(descriptor.widget.settings, "fieldPath", "");
  const [copyStatus, setCopyStatus] = useState<"copied" | "failed" | "idle">("idle");

  if (descriptor.widget.kind === "topic-echo") {
    const messages = data?.type === "topic-echo" ? data.messages : [];
    const echoText =
      messages.length > 0
        ? messages.map((message) => formatTopicEchoValue(message.value, true)).join("\n---\n")
        : "Waiting for messages...";
    return (
      <div className="bloom-topic-debug-widget">
        <header className="bloom-topic-debug-header">
          <div>
            <strong>{descriptor.widget.title}</strong>
            <span>{topic}</span>
          </div>
          <button
            className="bloom-topic-debug-action"
            disabled={messages.length === 0}
            onClick={() => copyTopicEchoText(echoText, setCopyStatus)}
            type="button"
          >
            Copy latest
          </button>
        </header>
        <pre className="bloom-topic-echo">{echoText}</pre>
        <span aria-live="polite" className="bloom-topic-debug-status">
          {copyStatus === "copied" ? "Copied to clipboard." : null}
          {copyStatus === "failed" ? "Copy failed." : null}
        </span>
      </div>
    );
  }

  if (descriptor.widget.kind === "topic-plot") {
    const samples = data?.type === "topic-plot" ? data.samples : [];
    const latestSample = samples.at(-1);
    return (
      <>
        <strong>{descriptor.widget.title}</strong>
        <span>{topic}</span>
        <div className="bloom-topic-plot" data-sample-count={samples.length}>
          <span>{latestSample ? `latest: ${latestSample.value}` : "Waiting for samples..."}</span>
        </div>
        <span>{fieldPath ? `field: ${fieldPath}` : descriptor.definition.displayName}</span>
      </>
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
