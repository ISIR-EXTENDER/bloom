import type {
  ApplicationConfig,
  RosTopicStatus,
  RuntimeActionPreset,
  ScreenConfig,
  WidgetConfig,
} from "@bloom/api-client";
import { modeCommandBinding, type WidgetControlState } from "@bloom/widget-renderers";
import {
  allowlistAllows,
  createDefaultWidgetRegistry,
  createWidgetActionIntent,
  describeUnavailableWidgetRuntime,
  isModeRequestTopic,
  type RuntimeCapability,
  readValueMappingTopic,
  resolveTeleopFrameId,
  resolveWidgetReadiness,
  TELEOP_DEFAULT_TARGET,
} from "@bloom/widgets";
import { resolveCommandRoute } from "./dispatch-commands";

export type RuntimeRobotStatus = {
  api: "connected" | "not-checked" | "unavailable";
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

const WIDGET_REGISTRY = createDefaultWidgetRegistry();
const TOPIC_COMMAND_WIDGET_KINDS = new Set(["command-button", "gesture-pad", "slider", "toggle"]);

const RUNTIME_TOPIC_REQUIREMENTS: RuntimeTopicRequirement[] = [
  { label: "Teleop", requirement: "subscriber", topic: "/joystick_cartesian_command" },
  { label: "Mode", requirement: "subscriber", topic: "/mode_request" },
  { label: "Joints", requirement: "publisher", topic: "/joint_states" },
  { label: "Controller", requirement: "publisher", topic: "/cartesian_command" },
  { label: "Servo velocity", requirement: "publisher", topic: "/visual_servoing/velocity_command" },
];

/**
 * `cartesian_manager` normalises a mode request before matching it, so two
 * spellings of the same mode are the same mode. Comparing raw strings here
 * would leave a button unlit after a request that worked.
 *
 * Mirrors `parameter_parsing.cpp` and the backend's
 * `normalize_mode_request_payload`.
 */
function normalizeModeRequest(value: string): string {
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

const DEFAULT_FRAME_REASONS = {
  releaseControls: "Release controls.",
  unavailableOnRobot: "Unavailable on this robot.",
};

export function createRuntimeControlStateByWidgetId(
  screen: ScreenConfig,
  options: {
    /** The app's presets, so a preset-driven button is lit and gated by the topic its press really goes to. */
    actionPresets?: readonly RuntimeActionPreset[];
    activeCommandFrameId?: string | null;
    allowedCommandFrameIds?: readonly string[] | null;
    commandFrameError?: string | null;
    frameReasons?: { releaseControls: string; unavailableOnRobot: string };
    runtimeCapabilities?: readonly RuntimeCapability[] | null;
    teleopActive?: boolean;
    /**
     * Where a joystick may publish: the app's own list, and what the server acknowledged for this app (its own
     * list narrowed by the app's). Null until the server has answered.
     */
    teleopTargets?: {
      app: readonly string[];
      effective: readonly string[] | null;
      reasons: { app: (topic: string) => string; server: (topic: string) => string };
    };
    topicStatuses?: readonly RosTopicStatus[] | null;
  } = {},
): Record<string, WidgetControlState> {
  const controlStateByWidgetId: Record<string, WidgetControlState> = {};

  for (const widget of screen.widgets) {
    let controlState: WidgetControlState = {};
    const frameId = resolveTeleopFrameId(widget.settings.runtime_binding);
    if (frameId) {
      const unavailable = options.allowedCommandFrameIds ? !options.allowedCommandFrameIds.includes(frameId) : false;
      const reasons = options.frameReasons ?? DEFAULT_FRAME_REASONS;
      // "Release controls" would promise a frame this robot never offers, so unsupported wins.
      const disabledReason = unavailable
        ? reasons.unavailableOnRobot
        : options.teleopActive
          ? reasons.releaseControls
          : undefined;
      controlState = {
        selection: frameId === options.activeCommandFrameId ? "selected" : "unselected",
        ...(disabledReason ? { disabled: true, disabledReason } : {}),
        ...(unavailable ? { unsupported: true } : {}),
      };
    } else if (
      widget.kind === "topic-echo" &&
      widget.settings.messageType === "geometry_msgs/msg/TwistStamped" &&
      options.activeCommandFrameId
    ) {
      controlState = { commandFrameId: options.activeCommandFrameId };
    } else {
      // The mode it asks for, routed through the app's presets; the renderer reads the store for it (ADR 0142).
      const widgetMode = resolveWidgetModeRequest(widget, options.actionPresets ?? []);
      const commandBinding = widgetMode ? modeCommandBinding(widgetMode.topic, widgetMode.mode) : null;
      if (commandBinding) {
        controlState = { commandBinding };
      }
    }

    const definition = WIDGET_REGISTRY.get(widget.kind);
    if (definition && options.runtimeCapabilities !== null && options.runtimeCapabilities !== undefined) {
      const readiness = resolveWidgetReadiness(definition, options.runtimeCapabilities);
      const disabledReason = describeUnavailableWidgetRuntime(readiness, options.runtimeCapabilities);
      if (disabledReason) {
        controlState = { ...controlState, disabled: true, disabledReason, unavailable: true };
      }
    }

    // A joystick pointed at a topic the server will refuse is dead before anyone touches it; say so now,
    // not with "Command failed" on the first press.
    const refusal = options.teleopTargets && describeTeleopTargetRefusal(widget, options.teleopTargets);
    if (refusal) {
      controlState = { ...controlState, disabled: true, disabledReason: refusal, unavailable: true };
    }

    if (options.commandFrameError && usesTeleopAdapter(widget)) {
      controlState = {
        ...controlState,
        disabled: true,
        disabledReason: options.commandFrameError,
        unavailable: true,
      };
    }

    const commandTopic = resolveWidgetCommandTopic(widget, options.actionPresets ?? []);
    if (commandTopic && options.topicStatuses !== undefined) {
      const topicStatus = options.topicStatuses?.find((candidate) => candidate.name === commandTopic);
      if (options.topicStatuses === null) {
        controlState = {
          ...controlState,
          disabled: true,
          disabledReason: `ROS subscriber readiness is unavailable for ${commandTopic}. Wait for the robot connection before using this control.`,
          unavailable: true,
        };
      } else if (!topicStatus || topicStatus.subscription_count === 0) {
        controlState = {
          ...controlState,
          disabled: true,
          disabledReason: `No ROS node subscribes to ${commandTopic}. Start the robot controller before using this control.`,
          unavailable: true,
        };
      }
    }

    if (Object.keys(controlState).length > 0) {
      controlStateByWidgetId[widget.id] = controlState;
    }
  }

  return controlStateByWidgetId;
}

/** The topic a teleop widget publishes on: its own, or the manager's input by default. */
export function resolveTeleopTargetTopic(widget: WidgetConfig): string | null {
  if (!usesTeleopAdapter(widget)) {
    return null;
  }
  const binding = widget.settings.runtime_binding as Record<string, unknown>;
  const valueMapping = binding.value_mapping;
  const mapping =
    typeof valueMapping === "object" && valueMapping !== null ? (valueMapping as Record<string, unknown>) : {};
  return readValueMappingTopic(mapping) ?? TELEOP_DEFAULT_TARGET;
}

function describeTeleopTargetRefusal(
  widget: WidgetConfig,
  targets: NonNullable<Parameters<typeof createRuntimeControlStateByWidgetId>[1]>["teleopTargets"],
): string | null {
  const topic = resolveTeleopTargetTopic(widget);
  if (!topic || !targets?.effective || allowlistAllows(targets.effective, topic)) {
    return null;
  }
  const appAllows = allowlistAllows(targets.app, topic);
  return appAllows ? targets.reasons.server(topic) : targets.reasons.app(topic);
}

export function usesTeleopAdapter(widget: WidgetConfig): boolean {
  const binding = widget.settings.runtime_binding;
  return (
    typeof binding === "object" &&
    binding !== null &&
    !Array.isArray(binding) &&
    (binding as Record<string, unknown>).adapter === "teleop"
  );
}

/**
 * The mode a widget asks for, or null if it is not a latching mode control.
 *
 * A momentary button is excluded on purpose. It already shows a held state
 * while pressed, and it restores a different mode on release, so giving it a
 * latching highlight as well would say two contradictory things at once.
 */
function resolveWidgetModeRequest(
  widget: WidgetConfig,
  presets: readonly RuntimeActionPreset[],
): { mode: string; topic: string } | null {
  if (widget.kind !== "command-button" || widget.settings.momentary === true) {
    return null;
  }
  const press = resolveCommandPress(widget, presets);
  if (!press || !isModeRequestTopic(press.topic)) {
    return null;
  }

  const payloadData = readPayloadData(press.payload);
  const raw = typeof payloadData === "string" && payloadData ? payloadData : press.command;
  if (typeof raw !== "string" || !raw) {
    return null;
  }

  const normalized = normalizeModeRequest(raw);
  return isModeRequest(normalized) ? { mode: normalized, topic: press.topic } : null;
}

/** The topic and payload a button's press publishes, resolved as the dispatcher resolves it. */
function resolveCommandPress(
  widget: WidgetConfig,
  presets: readonly RuntimeActionPreset[],
): { command?: string; payload: unknown; topic: string } | null {
  const intent = createWidgetActionIntent(widget, { type: "press" });
  if (intent.type === "topic-publish") {
    return { command: stringOrUndefined(widget.settings.command), payload: intent.payload, topic: intent.topic };
  }
  if (intent.type !== "command") {
    return null;
  }
  const route = resolveCommandRoute(intent, presets);
  if (route.kind === "topic") {
    return { command: intent.command, payload: route.publish.payload, topic: route.publish.topic };
  }
  if (route.kind === "preset" && route.preset.kind === "topic-publish" && route.preset.topic) {
    const { preset } = route;
    return { command: preset.command, payload: preset.payload, topic: preset.topic };
  }
  return null;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function createRuntimeRobotStatus(
  application: ApplicationConfig,
  topicStatuses: readonly RosTopicStatus[] | null,
  api: RuntimeRobotStatus["api"] = topicStatuses ? "connected" : "not-checked",
): RuntimeRobotStatus {
  return {
    api,
    topics: createRuntimeTopicStatusSummaries(application, topicStatuses),
  };
}

export function createRuntimeTopicStatusSummaries(
  application: ApplicationConfig,
  topicStatuses: readonly RosTopicStatus[] | null,
): RuntimeTopicStatusSummary[] {
  const configuredTopics = new Set(application.runtime_policy.allowed_publish_topics);
  const configuredTeleopTargets = new Set(application.runtime_policy.allowed_teleop_targets);
  const baseRequirements = RUNTIME_TOPIC_REQUIREMENTS.filter(
    (requirement) =>
      configuredTopics.has(requirement.topic) ||
      configuredTeleopTargets.has(requirement.topic) ||
      requirement.topic === "/joint_states" ||
      requirement.topic === "/cartesian_command" ||
      requirement.topic === "/visual_servoing/velocity_command",
  );
  const requirements = [...baseRequirements];
  const knownTopics = new Set(requirements.map((requirement) => requirement.topic));
  for (const screen of application.screens) {
    for (const widget of screen.widgets) {
      const topic = resolveWidgetCommandTopic(widget, application.action_presets ?? []);
      if (!topic || !configuredTopics.has(topic) || knownTopics.has(topic)) {
        continue;
      }
      requirements.push({ label: widget.title, requirement: "subscriber", topic });
      knownTopics.add(topic);
    }
  }

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

function resolveWidgetCommandTopic(widget: WidgetConfig, presets: readonly RuntimeActionPreset[]): string | null {
  if (!TOPIC_COMMAND_WIDGET_KINDS.has(widget.kind)) {
    return null;
  }
  if (widget.kind === "command-button") {
    return asTopicPath(resolveCommandPress(widget, presets)?.topic);
  }
  return asTopicPath(widget.settings.topic);
}

function asTopicPath(topic: unknown): string | null {
  return typeof topic === "string" && topic.startsWith("/") ? topic : null;
}

function readPayloadData(payload: unknown): unknown {
  const parsed = typeof payload === "string" ? parsePayloadText(payload) : payload;
  if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) && "data" in parsed) {
    return parsed.data;
  }

  return parsed;
}

/** A payload saved as text: JSON, or the ROS CLI's YAML flow form `{data: 'geometric/jaco'}`. */
function parsePayloadText(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) {
    return text;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = /^\{\s*data\s*:\s*(?:'([^']*)'|"([^"]*)"|([^,}]*?))\s*\}$/.exec(trimmed);
    if (!match) {
      return text;
    }
    const quoted = match[1] ?? match[2];
    if (quoted !== undefined) {
      return { data: quoted };
    }
    const bare = match[3] ?? "";
    return { data: /^-?\d+(\.\d+)?$/.test(bare) ? Number(bare) : bare };
  }
}
