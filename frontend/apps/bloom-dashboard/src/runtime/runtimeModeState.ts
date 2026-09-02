import type { ApplicationConfig, RosTopicStatus, ScreenConfig, WidgetConfig } from "@bloom/api-client";
import type { WidgetControlState } from "@bloom/widget-renderers";
import type { WidgetActionIntent } from "@bloom/widgets";

export type RuntimeRobotMode = "b1" | "b2";

export type RuntimeModeState = {
  mode: RuntimeRobotMode;
  /**
   * The last mode this session asked `cartesian_manager` for, normalised the
   * way the manager normalises it.
   *
   * The manager publishes only `/cartesian_command` and
   * `/joint_target_command`; it never reports which mode it is in. So this is
   * a record of what was requested, never a confirmation of what the arm is
   * doing, and the UI has to say so.
   */
  requestedMode: string | null;
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

const MODE_REQUEST_TOPIC = "/mode_request";

const DEFAULT_MODE_STATE: RuntimeModeState = {
  mode: "b1",
  requestedMode: null,
  source: "configuration-default",
  updatedAt: "",
};

const RUNTIME_TOPIC_REQUIREMENTS: RuntimeTopicRequirement[] = [
  { label: "Teleop", requirement: "subscriber", topic: "/joystick_cartesian_command" },
  { label: "Mode", requirement: "subscriber", topic: "/mode_request" },
  { label: "Joints", requirement: "publisher", topic: "/joint_states" },
  { label: "Controller", requirement: "publisher", topic: "/cartesian_command" },
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
  const requestedMode = resolveModeRequestFromIntent(intent);
  if (requestedMode) {
    return {
      ...currentState,
      requestedMode,
      source: "operator-command",
      updatedAt: now.toISOString(),
    };
  }

  const mode = resolveModeFromIntent(intent);
  if (!mode) {
    return currentState;
  }

  return {
    ...currentState,
    mode,
    source: "operator-command",
    updatedAt: now.toISOString(),
  };
}

/**
 * `cartesian_manager` normalises a mode request before matching it, so two
 * spellings of the same mode are the same mode. Comparing raw strings here
 * would leave a button unlit after a request that worked.
 *
 * Mirrors `parameter_parsing.cpp` and the backend's
 * `normalize_mode_request_payload`.
 */
export function normalizeModeRequest(value: string): string {
  return value.trim().toLowerCase().replaceAll("-", "_");
}

/**
 * Whether a string is a mode request rather than some other command.
 *
 * Only the manager's two branches count. Without this, any unrelated command
 * intent would be taken for a mode change and would silently unlight whichever
 * mode button was showing as requested.
 */
function isModeRequest(value: string): boolean {
  return /^(behaviour|geometric)\//.test(value);
}

function resolveModeRequestFromIntent(intent: WidgetActionIntent): string | null {
  if (intent.type === "topic-publish") {
    if (intent.topic !== MODE_REQUEST_TOPIC) {
      return null;
    }
    const data = readPayloadData(intent.payload);
    if (typeof data !== "string") {
      return null;
    }
    const normalized = normalizeModeRequest(data);
    return isModeRequest(normalized) ? normalized : null;
  }

  if (intent.type === "command" && intent.command) {
    // A command intent does not carry its topic; it is routed by preset. The
    // command string is the mode string, so the grammar is what identifies it.
    const normalized = normalizeModeRequest(intent.command);
    return isModeRequest(normalized) ? normalized : null;
  }

  return null;
}

export function createRuntimeControlStateByWidgetId(
  screen: ScreenConfig,
  modeState: RuntimeModeState,
): Record<string, WidgetControlState> {
  const controlStateByWidgetId: Record<string, WidgetControlState> = {};

  for (const widget of screen.widgets) {
    if (isModeToggleWidget(widget)) {
      controlStateByWidgetId[widget.id] = {
        toggleState: modeState.mode === "b2" ? "on" : "off",
      };
      continue;
    }

    const widgetMode = resolveWidgetModeRequest(widget);
    if (!widgetMode) {
      continue;
    }

    controlStateByWidgetId[widget.id] = {
      selection: widgetMode === modeState.requestedMode ? "selected" : "unselected",
    };
  }

  return controlStateByWidgetId;
}

/**
 * The mode a widget asks for, or null if it is not a latching mode control.
 *
 * A momentary button is excluded on purpose. It already shows a held state
 * while pressed, and it restores a different mode on release, so giving it a
 * latching highlight as well would say two contradictory things at once.
 */
function resolveWidgetModeRequest(widget: WidgetConfig): string | null {
  if (widget.kind !== "command-button" || widget.settings.momentary === true) {
    return null;
  }
  if (widget.settings.topic !== MODE_REQUEST_TOPIC) {
    return null;
  }

  const payloadData = readPayloadData(widget.settings.payload);
  const raw = typeof payloadData === "string" ? payloadData : widget.settings.command;
  if (typeof raw !== "string" || !raw) {
    return null;
  }

  const normalized = normalizeModeRequest(raw);
  return isModeRequest(normalized) ? normalized : null;
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
      requirement.topic === "/cartesian_command" ||
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
