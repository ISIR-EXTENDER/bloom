import type { ApplicationConfig, RosTopicStatus } from "@bloom/api-client";
import { knownValue, managerKey, useCommandState } from "@bloom/widget-renderers";
import { useCallback, useEffect, useMemo, useState } from "react";
import { describeApiError } from "../ui/api-error";
import type { RuntimeActionClient } from "./runtime-action-dispatcher";
import { createRuntimeRobotStatus, type RuntimeRobotStatus } from "./runtimeModeState";
import { enRuntimeStrings } from "./strings/en";
import type { RuntimeStrings } from "./strings/types";

type RuntimeRobotStatusPanelProps = {
  application: ApplicationConfig;
  client: Pick<RuntimeActionClient, "listRosTopicStatus">;
  refreshIntervalMs?: number;
  sessionStatus?: "checking" | "live" | "local" | "unavailable";
  strings?: RuntimeStrings["supervisor"]["status"];
};

export function RuntimeRobotStatusPanel({
  application,
  client,
  refreshIntervalMs = 0,
  sessionStatus = "local",
  strings = enRuntimeStrings.supervisor.status,
}: RuntimeRobotStatusPanelProps) {
  const [apiStatus, setApiStatus] = useState<RuntimeRobotStatus["api"]>(() =>
    client.listRosTopicStatus ? "not-checked" : "unavailable",
  );
  const [statusDetail, setStatusDetail] = useState(strings.notChecked);
  const [topicStatuses, setTopicStatuses] = useState<readonly RosTopicStatus[] | null>(null);

  const robotStatus = useMemo(
    () => createRuntimeRobotStatus(application, topicStatuses, apiStatus),
    [apiStatus, application, topicStatuses],
  );

  // The manager's shaping mode as the backend's store holds it (ADR 0142).
  const shaping = knownValue(useCommandState(managerKey("shaping")));

  const refreshStatus = useCallback(async () => {
    if (!client.listRosTopicStatus) {
      setApiStatus("unavailable");
      setStatusDetail(strings.unavailable);
      return;
    }

    try {
      const nextTopicStatuses = await client.listRosTopicStatus();
      setTopicStatuses(nextTopicStatuses);
      setApiStatus("connected");
      setStatusDetail(strings.topicsLoaded(nextTopicStatuses.length));
    } catch (error) {
      setApiStatus("unavailable");
      setStatusDetail(describeApiError(error, strings.refreshFailed));
    }
  }, [client, strings]);

  useEffect(() => {
    void refreshStatus();
    if (refreshIntervalMs <= 0) {
      return;
    }
    const interval = window.setInterval(() => void refreshStatus(), refreshIntervalMs);
    return () => window.clearInterval(interval);
  }, [refreshIntervalMs, refreshStatus]);

  return (
    <aside className="runtime-robot-status" aria-label={strings.panelLabel}>
      <div className="runtime-robot-status-summary">
        <RuntimeStatusPill label={strings.api} status={robotStatus.api === "connected" ? "ready" : robotStatus.api}>
          {robotStatus.api === "connected"
            ? strings.connected
            : robotStatus.api === "unavailable"
              ? strings.unavailable
              : strings.checking}
        </RuntimeStatusPill>
        <RuntimeStatusPill label={strings.session} status={resolveSessionPillStatus(sessionStatus)}>
          {resolveSessionLabel(sessionStatus, strings)}
        </RuntimeStatusPill>
        <RuntimeStatusPill label={strings.mode} status={shaping ? "ready" : "unknown"}>
          {typeof shaping?.value === "string" ? shaping.value.toUpperCase() : strings.notChecked}
        </RuntimeStatusPill>
      </div>

      <ul className="runtime-robot-topic-list" aria-label={strings.topicListLabel}>
        {robotStatus.topics.map((topicStatus) => (
          <li key={topicStatus.topic}>
            <span>
              <strong>{topicStatus.label}</strong>
              <small>{topicStatus.topic}</small>
            </span>
            <strong data-status={topicStatus.status}>{resolveTopicStatusLabel(topicStatus, strings)}</strong>
          </li>
        ))}
      </ul>

      <button className="runtime-robot-status-refresh" onClick={refreshStatus} type="button">
        {strings.refresh}
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
      <strong className="runtime-status-pill-value">{children}</strong>
    </span>
  );
}

function resolveSessionPillStatus(
  sessionStatus: NonNullable<RuntimeRobotStatusPanelProps["sessionStatus"]>,
): RuntimeStatusPillProps["status"] {
  if (sessionStatus === "live") {
    return "ready";
  }
  if (sessionStatus === "checking") {
    return "not-checked";
  }
  if (sessionStatus === "unavailable") {
    return "unavailable";
  }
  return "unknown";
}

function resolveSessionLabel(
  sessionStatus: NonNullable<RuntimeRobotStatusPanelProps["sessionStatus"]>,
  strings: RuntimeStrings["supervisor"]["status"],
): string {
  if (sessionStatus === "live") {
    return strings.live;
  }
  if (sessionStatus === "checking") {
    return strings.checking;
  }
  if (sessionStatus === "unavailable") {
    return strings.unavailable;
  }
  return strings.local;
}

function resolveTopicStatusLabel(
  topicStatus: RuntimeRobotStatus["topics"][number],
  strings: RuntimeStrings["supervisor"]["status"],
): string {
  if (topicStatus.status === "ready") {
    return strings.live;
  }
  if (topicStatus.status === "missing") {
    return strings.missing;
  }
  if (topicStatus.status === "unknown") {
    return strings.notChecked;
  }
  return topicStatus.requirement === "publisher" ? strings.noPublisher : strings.noSubscriber;
}
