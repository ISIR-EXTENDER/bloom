import type { ApplicationConfig, RosTopicStatus } from "@bloom/api-client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { RuntimeActionClient } from "./runtime-action-dispatcher";
import { createRuntimeRobotStatus, type RuntimeModeState, type RuntimeRobotStatus } from "./runtimeModeState";

type RuntimeRobotStatusPanelProps = {
  application: ApplicationConfig;
  client: RuntimeActionClient;
  modeState: RuntimeModeState;
};

export function RuntimeRobotStatusPanel({ application, client, modeState }: RuntimeRobotStatusPanelProps) {
  const [apiStatus, setApiStatus] = useState<RuntimeRobotStatus["api"]>(() =>
    client.listRosTopicStatus ? "not-checked" : "unavailable",
  );
  const [statusDetail, setStatusDetail] = useState("ROS diagnostics not checked.");
  const [topicStatuses, setTopicStatuses] = useState<readonly RosTopicStatus[] | null>(null);

  const robotStatus = useMemo(
    () => createRuntimeRobotStatus(application, modeState, topicStatuses, apiStatus),
    [apiStatus, application, modeState, topicStatuses],
  );

  const refreshStatus = useCallback(async () => {
    if (!client.listRosTopicStatus) {
      setApiStatus("unavailable");
      setStatusDetail("ROS diagnostics unavailable.");
      return;
    }

    try {
      const nextTopicStatuses = await client.listRosTopicStatus();
      setTopicStatuses(nextTopicStatuses);
      setApiStatus("connected");
      setStatusDetail(`${nextTopicStatuses.length} topic diagnostics loaded.`);
    } catch (error) {
      setApiStatus("unavailable");
      setStatusDetail(getErrorMessage(error));
    }
  }, [client]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  return (
    <aside className="runtime-robot-status" aria-label="Runtime robot status">
      <div className="runtime-robot-status-summary">
        <RuntimeStatusPill label="API" status={robotStatus.api === "connected" ? "ready" : robotStatus.api}>
          {robotStatus.api === "connected"
            ? "Connected"
            : robotStatus.api === "unavailable"
              ? "Unavailable"
              : "Checking"}
        </RuntimeStatusPill>
        <RuntimeStatusPill label="Session" status={client.sendTeleopCommand ? "ready" : "unknown"}>
          {client.sendTeleopCommand ? "Live" : "Local"}
        </RuntimeStatusPill>
        <RuntimeStatusPill label="Mode" status={robotStatus.mode.source === "operator-command" ? "ready" : "unknown"}>
          {robotStatus.mode.mode.toUpperCase()}
        </RuntimeStatusPill>
      </div>

      <ul className="runtime-robot-topic-list" aria-label="Runtime topic status">
        {robotStatus.topics.map((topicStatus) => (
          <li key={topicStatus.topic}>
            <span>
              <strong>{topicStatus.label}</strong>
              <small>{topicStatus.topic}</small>
            </span>
            <strong data-status={topicStatus.status}>{topicStatus.statusLabel}</strong>
          </li>
        ))}
      </ul>

      <button className="runtime-robot-status-refresh" onClick={refreshStatus} type="button">
        Refresh status
      </button>
      <p>{statusDetail}</p>
    </aside>
  );
}

type RuntimeStatusPillProps = {
  children: string;
  label: string;
  status: "connected" | "not-checked" | "ready" | "unavailable" | "unknown";
};

function RuntimeStatusPill({ children, label, status }: RuntimeStatusPillProps) {
  return (
    <span className="runtime-status-pill" data-status={status}>
      <small>{label}</small>
      <strong>{children}</strong>
    </span>
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Runtime status refresh failed.";
}
