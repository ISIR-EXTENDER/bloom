import { formatTopicEchoValue } from "@bloom/widgets";
import { getStringSetting } from "./settings-readers";
import type { WidgetRendererProps } from "./types";

export function TopicDebugWidget({ data, descriptor }: WidgetRendererProps) {
  const topic = getStringSetting(descriptor.widget.settings, "topic", "No topic configured");
  const fieldPath = getStringSetting(descriptor.widget.settings, "fieldPath", "");

  if (descriptor.widget.kind === "topic-echo") {
    const messages = data?.type === "topic-echo" ? data.messages : [];
    return (
      <>
        <strong>{descriptor.widget.title}</strong>
        <span>{topic}</span>
        <pre className="bloom-topic-echo">
          {messages.length > 0
            ? messages.map((message) => formatTopicEchoValue(message.value, true)).join("\n---\n")
            : "Waiting for messages..."}
        </pre>
      </>
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
