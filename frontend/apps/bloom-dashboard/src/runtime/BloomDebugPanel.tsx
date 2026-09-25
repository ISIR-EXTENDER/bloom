import type {
  RosTopicInfo,
  RosTopicStatus,
  RuntimeAuditRecord,
  RuntimeRecordingResponse,
  RuntimeRecordingStartRequest,
} from "@bloom/api-client";
import { TELEOP_DEFAULT_TARGET } from "@bloom/widgets";
import { type ReactNode, useState } from "react";
import { describeApiError } from "../ui/api-error";
import type { RuntimeActionClient } from "./runtime-action-dispatcher";

type BloomDebugPanelProps = {
  client: RuntimeActionClient;
  /** The screen's `debug-status` region: drawn at its authored size and scaled with the artboard. */
  region?: { left: number; scale: number; top: number; width: number } | null;
};

export function BloomDebugPanel({ client, region = null }: BloomDebugPanelProps) {
  const [auditRecords, setAuditRecords] = useState<RuntimeAuditRecord[]>([]);
  const [recording, setRecording] = useState<RuntimeRecordingResponse | null>(null);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [status, setStatus] = useState("Load topics to start a debug session.");
  const [topics, setTopics] = useState<DebugTopic[]>([]);

  const loadTopics = async () => {
    if (!client.listRosTopicStatus && !client.listRosTopics) {
      setStatus("Topic catalog is not connected in this runtime.");
      return;
    }

    try {
      const nextTopics = await loadDebugTopics(client);
      setTopics(nextTopics);
      setSelectedTopics((currentTopics) =>
        currentTopics.length > 0 ? currentTopics : getDefaultSelectedTopics(nextTopics),
      );
      setStatus(nextTopics.length > 0 ? `${nextTopics.length} topics available.` : "No live topics discovered yet.");
    } catch (error) {
      setStatus(describeApiError(error, "Bloom Debug action failed."));
    }
  };

  const loadAudit = async () => {
    if (!client.listRuntimeAuditRecords) {
      setStatus("Runtime audit is not connected in this runtime.");
      return;
    }

    try {
      const records = await client.listRuntimeAuditRecords(8);
      setAuditRecords(records);
      setStatus(records.length > 0 ? `${records.length} audit records loaded.` : "No runtime audit records yet.");
    } catch (error) {
      setStatus(describeApiError(error, "Bloom Debug action failed."));
    }
  };

  const startRecording = async () => {
    if (!client.startRuntimeRecording) {
      setStatus("Recording adapter is not connected in this runtime.");
      return;
    }
    if (selectedTopics.length === 0) {
      setStatus("Select at least one topic before starting a recording.");
      return;
    }

    try {
      const request: RuntimeRecordingStartRequest = {
        label: "Bloom Debug recording",
        output_folder: "data/recordings",
        topics: selectedTopics,
      };
      const receipt = await client.startRuntimeRecording(request);
      setRecording(receipt);
      setStatus(receipt.detail);
      await loadAudit();
    } catch (error) {
      setStatus(describeApiError(error, "Bloom Debug action failed."));
    }
  };

  const stopRecording = async () => {
    if (!recording || !client.stopRuntimeRecording) {
      return;
    }

    try {
      const receipt = await client.stopRuntimeRecording(recording.recording_id);
      setRecording(null);
      setStatus(receipt.detail);
      await loadAudit();
    } catch (error) {
      setStatus(describeApiError(error, "Bloom Debug action failed."));
    }
  };

  const preflight = topics.length > 0 ? buildRobotPreflightRows(topics) : [];
  const readyCount = preflight.filter((row) => row.status === "ready").length;
  const latestAudit = auditRecords[0];

  return (
    <aside
      aria-label="Bloom Debug controls"
      className="bloom-debug-panel"
      data-placement={region ? "region" : "band"}
      style={
        region
          ? {
              left: region.left,
              top: region.top,
              transform: `scale(${region.scale})`,
              width: region.width,
            }
          : undefined
      }
    >
      <DebugCard
        label="Robot preflight"
        note={topics.length === 0 ? "Refresh topics before robot tests." : status}
        summary={topics.length === 0 ? "No topics loaded yet" : `${readyCount} of ${preflight.length} ready`}
      >
        {preflight.length > 0 ? (
          <ul className="bloom-debug-preflight-list">
            {preflight.map((row) => (
              <li key={row.topic}>
                <span>
                  <strong className="bloom-debug-preflight-title">{row.label}</strong>
                  <small>{row.topic}</small>
                </span>
                <strong data-status={row.status}>{row.status_label}</strong>
              </li>
            ))}
          </ul>
        ) : null}
      </DebugCard>

      <DebugCard
        label="Topic catalog"
        note="Discovered from the ROS graph."
        summary={
          topics.length === 0 ? "No topics loaded yet" : `${topics.length} topics · ${selectedTopics.length} to record`
        }
      >
        {topics.length > 0 ? (
          <ul className="bloom-debug-topic-list">
            {topics.map((topic) => (
              <li key={topic.name}>
                <label>
                  <input
                    checked={selectedTopics.includes(topic.name)}
                    onChange={() => setSelectedTopics((currentTopics) => toggleTopic(currentTopics, topic.name))}
                    type="checkbox"
                  />
                  <span>
                    <strong>{topic.name}</strong>
                    <small>{topic.message_type}</small>
                    {topic.publisher_count !== undefined && topic.subscription_count !== undefined ? (
                      <small>
                        {topic.publisher_count} pub · {topic.subscription_count} sub
                      </small>
                    ) : null}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        ) : null}
      </DebugCard>

      <DebugCard
        label="Runtime audit"
        note={recording ? "Recording. Stop it to add the record." : "Start recording to add one."}
        summary={latestAudit ? `${auditRecords.length} records · latest ${latestAudit.status}` : "No audit records yet"}
      >
        {auditRecords.length > 0 ? (
          <ul className="bloom-debug-audit-list">
            {auditRecords.map((record) => (
              <li key={`${record.recorded_at}:${record.channel}:${record.topic}:${record.target}`}>
                <strong data-status={record.status}>{record.status}</strong>
                <span>{record.topic || record.target || record.channel}</span>
                <small>
                  {record.detail}
                  {record.repeats && record.repeats > 1 ? ` ×${record.repeats}` : null}
                </small>
              </li>
            ))}
          </ul>
        ) : null}
      </DebugCard>

      <div className="bloom-debug-panel-actions">
        <button onClick={loadTopics} type="button">
          Refresh topics
        </button>
        <button onClick={loadAudit} type="button">
          Refresh audit
        </button>
        {recording ? (
          <button className="bloom-debug-danger-action" onClick={stopRecording} type="button">
            Stop recording
          </button>
        ) : (
          <button className="bloom-debug-primary-action" onClick={startRecording} type="button">
            Start recording
          </button>
        )}
        <p aria-live="polite" className="sr-only">
          {status}
        </p>
      </div>
    </aside>
  );
}

/** A 104 px status card; its full list opens below it on demand so the row keeps its height. */
function DebugCard({
  children,
  label,
  note,
  summary,
}: {
  children: ReactNode;
  label: string;
  note: string;
  summary: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section aria-label={label} className="bloom-debug-card">
      <h4>{label}</h4>
      <strong>{summary}</strong>
      <small>{note}</small>
      {children ? (
        <>
          <button aria-expanded={open} className="bloom-debug-card-toggle" onClick={() => setOpen(!open)} type="button">
            {open ? "Hide" : "Show"}
          </button>
          {open ? <div className="bloom-debug-card-details">{children}</div> : null}
        </>
      ) : null}
    </section>
  );
}

type DebugTopic = RosTopicInfo & Partial<Pick<RosTopicStatus, "publisher_count" | "subscription_count">>;

type RobotPreflightRequirement = "publisher" | "subscriber";

type RobotPreflightTopic = {
  label: string;
  requirement: RobotPreflightRequirement;
  topic: string;
};

type RobotPreflightRow = RobotPreflightTopic & {
  status: "missing" | "ready" | "unknown" | "waiting";
  status_label: string;
};

const ROBOT_PREFLIGHT_TOPICS: RobotPreflightTopic[] = [
  { label: "Teleop command", requirement: "subscriber", topic: TELEOP_DEFAULT_TARGET },
  { label: "Joint states", requirement: "publisher", topic: "/joint_states" },
  { label: "Controller feedback", requirement: "publisher", topic: "/cartesian_command" },
];

const DEFAULT_RECORDING_TOPIC_NAMES = [TELEOP_DEFAULT_TARGET, "/cartesian_command", "/joint_states"];

async function loadDebugTopics(client: RuntimeActionClient): Promise<DebugTopic[]> {
  if (client.listRosTopicStatus) {
    try {
      return await client.listRosTopicStatus();
    } catch (error) {
      if (!client.listRosTopics) {
        throw error;
      }
    }
  }

  if (client.listRosTopics) {
    return client.listRosTopics();
  }

  return [];
}

function getDefaultSelectedTopics(topics: readonly DebugTopic[]): string[] {
  const topicNames = new Set(topics.map((topic) => topic.name));
  const robotDebugTopics = DEFAULT_RECORDING_TOPIC_NAMES.filter((topicName) => topicNames.has(topicName));
  return robotDebugTopics.length > 0 ? robotDebugTopics : topics.slice(0, 3).map((topic) => topic.name);
}

function buildRobotPreflightRows(topics: readonly DebugTopic[]): RobotPreflightRow[] {
  return ROBOT_PREFLIGHT_TOPICS.map((preflightTopic) => {
    const topic = topics.find((candidate) => candidate.name === preflightTopic.topic);
    if (!topic) {
      return {
        ...preflightTopic,
        status: "missing",
        status_label: "Missing",
      };
    }

    const count = preflightTopic.requirement === "publisher" ? topic.publisher_count : topic.subscription_count;
    if (count === undefined) {
      return {
        ...preflightTopic,
        status: "unknown",
        status_label: "Visible",
      };
    }

    return {
      ...preflightTopic,
      status: count > 0 ? "ready" : "waiting",
      status_label: count > 0 ? "Ready" : preflightTopic.requirement === "publisher" ? "No publisher" : "No subscriber",
    };
  });
}

function toggleTopic(currentTopics: readonly string[], topic: string): string[] {
  return currentTopics.includes(topic)
    ? currentTopics.filter((candidate) => candidate !== topic)
    : [...currentTopics, topic];
}
