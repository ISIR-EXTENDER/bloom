import type {
  RosTopicInfo,
  RosTopicStatus,
  RuntimeAuditRecord,
  RuntimeRecordingResponse,
  RuntimeRecordingStartRequest,
} from "@bloom/api-client";
import { useState } from "react";
import type { RuntimeActionClient } from "./runtime-action-dispatcher";

type BloomDebugPanelProps = {
  client: RuntimeActionClient;
};

export function BloomDebugPanel({ client }: BloomDebugPanelProps) {
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
      setStatus(getErrorMessage(error));
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
      setStatus(getErrorMessage(error));
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
      setStatus(getErrorMessage(error));
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
      setStatus(getErrorMessage(error));
    }
  };

  return (
    <aside className="bloom-debug-panel" aria-label="Bloom Debug controls">
      <div className="bloom-debug-panel-main">
        <div>
          <p className="eyebrow">Bloom Debug</p>
          <h3>Inspect, record, and audit runtime topics.</h3>
        </div>
        <p>{status}</p>
      </div>

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
          <button onClick={startRecording} type="button">
            Start recording
          </button>
        )}
      </div>

      <div className="bloom-debug-panel-grid">
        <section aria-labelledby="bloom-debug-robot-preflight">
          <h4 id="bloom-debug-robot-preflight">Robot preflight</h4>
          {topics.length === 0 ? (
            <p>Refresh topics before robot tests.</p>
          ) : (
            <ul className="bloom-debug-preflight-list">
              {buildRobotPreflightRows(topics).map((row) => (
                <li key={row.topic}>
                  <span>
                    <strong className="bloom-debug-preflight-title">{row.label}</strong>
                    <small>{row.topic}</small>
                  </span>
                  <strong data-status={row.status}>{row.status_label}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="bloom-debug-topic-catalog">
          <h4 id="bloom-debug-topic-catalog">Topic catalog</h4>
          {topics.length === 0 ? (
            <p>No topics loaded yet.</p>
          ) : (
            <ul className="bloom-debug-topic-list">
              {topics.slice(0, 8).map((topic) => (
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
          )}
        </section>

        <section aria-labelledby="bloom-debug-audit">
          <h4 id="bloom-debug-audit">Runtime audit</h4>
          {auditRecords.length === 0 ? (
            <p>No audit records loaded yet.</p>
          ) : (
            <ul className="bloom-debug-audit-list">
              {auditRecords.slice(0, 5).map((record) => (
                <li key={`${record.recorded_at}:${record.channel}:${record.topic}:${record.target}`}>
                  <strong data-status={record.status}>{record.status}</strong>
                  <span>{record.topic || record.target || record.channel}</span>
                  <small>{record.detail}</small>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </aside>
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
  { label: "Teleop command", requirement: "subscriber", topic: "/teleop_cmd" },
  { label: "Joint states", requirement: "publisher", topic: "/joint_states" },
  { label: "Controller feedback", requirement: "publisher", topic: "/sandbox_controller/velocity_command" },
];

const DEFAULT_RECORDING_TOPIC_NAMES = ["/teleop_cmd", "/sandbox_controller/velocity_command", "/joint_states"];

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

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Bloom Debug action failed.";
}
