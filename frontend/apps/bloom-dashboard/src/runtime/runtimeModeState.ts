import type { ApplicationConfig, RosTopicStatus, ScreenConfig, WidgetConfig } from "@bloom/api-client";
import type { WidgetControlState } from "@bloom/widget-renderers";
import type { WidgetActionIntent } from "@bloom/widgets";

export type RuntimeRobotMode = "b1" | "b2";

export type RuntimeModeState = {
  mode: RuntimeRobotMode;
  source: "configuration-default" | "operator-command";
  updatedAt: string;
};

export type RuntimeRobotStatus = {
  api: "connected" | "not-checked" | "unavailable";
  mode: RuntimeModeState;
  topics: RuntimeTopicStatusSummary[];
};

export type RuntimeTopicStatusSummary = {
  label: string;
  requirement: "publisher" | "subscriber";
  status: "missing" | "ready" | "unknown" | "waiting";
  statusLabel: string;
  topic: string;
};

type RuntimeTopicRequirement = Pick<RuntimeTopicStatusSummary, "label" | "requirement" | "topic">;

const DEFAULT_MODE_STATE: RuntimeModeState = {
  mode: "b1",
  source: "configuration-default",
  updatedAt: "",
};

const RUNTIME_TOPIC_REQUIREMENTS: RuntimeTopicRequirement[] = [
  { label: "Teleop", requirement: "subscriber", topic: "/teleop_cmd" },
  { label: "Mode", requirement: "subscriber", topic: "/cmd/mode" },
  { label: "Joints", requirement: "publisher", topic: "/joint_states" },
  { label: "Controller", requirement: "publisher", topic: "/sandbox_controller/velocity_command" },
  { label: "Servo velocity", requirement: "publisher", topic: "/visual_servoing/velocity_command" },
];

export function createDefaultRuntimeModeState(): RuntimeModeState {
  return { ...DEFAULT_MODE_STATE };
}

export function applyRuntimeModeIntent(
  currentState: RuntimeModeState,
  intent: WidgetActionIntent,
  now = new Date(),
): RuntimeModeState {
  const mode = resolveModeFromIntent(intent);
  if (!mode) {
    return currentState;
  }

  return {
    mode,
    source: "operator-command",
    updatedAt: now.toISOString(),
  };
}

export function createRuntimeControlStateByWidgetId(
  screen: ScreenConfig,
  modeState: RuntimeModeState,
): Record<string, WidgetControlState> {
  const controlStateByWidgetId: Record<string, WidgetControlState> = {};

  for (const widget of screen.widgets) {
    if (!isModeToggleWidget(widget)) {
      continue;
    }

    controlStateByWidgetId[widget.id] = {
      toggleState: modeState.mode === "b2" ? "on" : "off",
    };
  }

  return controlStateByWidgetId;
}

export function createRuntimeRobotStatus(
  application: ApplicationConfig,
  modeState: RuntimeModeState,
  topicStatuses: readonly RosTopicStatus[] | null,
  api: RuntimeRobotStatus["api"] = topicStatuses ? "connected" : "not-checked",
): RuntimeRobotStatus {
  return {
    api,
    mode: modeState,
    topics: createRuntimeTopicStatusSummaries(application, topicStatuses),
  };
}

export function createRuntimeTopicStatusSummaries(
  application: ApplicationConfig,
  topicStatuses: readonly RosTopicStatus[] | null,
): RuntimeTopicStatusSummary[] {
  const configuredTopics = new Set(application.runtime_policy.allowed_publish_topics);
  const configuredTeleopTargets = new Set(application.runtime_policy.allowed_teleop_targets);
  const requirements = RUNTIME_TOPIC_REQUIREMENTS.filter(
    (requirement) =>
      configuredTopics.has(requirement.topic) ||
      configuredTeleopTargets.has(requirement.topic) ||
      requirement.topic === "/joint_states" ||
      requirement.topic === "/sandbox_controller/velocity_command" ||
      requirement.topic === "/visual_servoing/velocity_command",
  );

  return requirements.map((requirement) => {
    if (!topicStatuses) {
      return {
        ...requirement,
        status: "unknown",
        statusLabel: "Not checked",
      };
    }

    const topicStatus = topicStatuses.find((candidate) => candidate.name === requirement.topic);
    if (!topicStatus) {
      return {
        ...requirement,
        status: "missing",
        statusLabel: "Missing",
      };
    }

    const count =
      requirement.requirement === "publisher" ? topicStatus.publisher_count : topicStatus.subscription_count;
    return {
      ...requirement,
      status: count > 0 ? "ready" : "waiting",
      statusLabel: count > 0 ? "Ready" : requirement.requirement === "publisher" ? "No publisher" : "No subscriber",
    };
  });
}

function resolveModeFromIntent(intent: WidgetActionIntent): RuntimeRobotMode | null {
  if (intent.type !== "topic-publish" || intent.topic !== "/cmd/mode") {
    return null;
  }

  const payloadData = readPayloadData(intent.payload);
  if (payloadData === 3) {
    return "b2";
  }
  if (payloadData === 0) {
    return "b1";
  }
  return null;
}

function isModeToggleWidget(widget: WidgetConfig): boolean {
  return (
    widget.kind === "toggle" &&
    widget.settings.topic === "/cmd/mode" &&
    readPayloadData(widget.settings.onPayload) === 3 &&
    readPayloadData(widget.settings.offPayload) === 0
  );
}

function readPayloadData(payload: unknown): unknown {
  if (typeof payload === "object" && payload !== null && !Array.isArray(payload) && "data" in payload) {
    return payload.data;
  }

  return payload;
}
