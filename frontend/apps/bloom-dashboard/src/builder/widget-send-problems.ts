import type { RuntimeActionPreset, WidgetConfig } from "@bloom/api-client";
import {
  allowlistAllows,
  asRecord,
  createWidgetActionIntent,
  isModeRequestTopic,
  isRecord,
  messageTypeSuggestionFor,
  NAVIGATE_SCREEN_COMMAND,
  normalizeWidgetSettings,
  parseModeRequest,
  readModeRequestData,
  readToggleTopic,
  resolveCommandRoute,
  resolveTeleopFrameId,
  resolveWidgetDestination,
  robotFamily,
  TELEOP_DEFAULT_TARGET,
} from "@bloom/widgets";
import { DEFAULT_SPEED_LIMIT_CAPS, describeSpeedCapExcess, type SpeedLimitCaps } from "./speed-limit-caps";
import { resolveWidgetPreset, resolveWidgetRoute } from "./widget-publish-route";

export const MODE_REQUEST_TOPIC = "/mode_request";
export const SERVICE_CALL_KIND = "service-call";
const STRING_MESSAGE_TYPE = "std_msgs/msg/String";
const FLOAT_MESSAGE_TYPES = new Set(["std_msgs/msg/Float32", "std_msgs/msg/Float64"]);
const INTEGER_MESSAGE_TYPES = new Set(["std_msgs/msg/Int32", "std_msgs/msg/Int64"]);
const SENDING_KINDS = new Set(["command-button", "gesture-pad", "joystick", "slider", "toggle"]);

/**
 * The server's live parameter bounds, backend safety.py DEFAULT_PARAMETER_BOUNDS. /capabilities does not report
 * them, so a deployment that overrides them is not seen here.
 */
const PARAMETER_BOUNDS: Readonly<Record<string, readonly [number, number]>> = {
  "/cartesian_manager:rate_limiter.max_angular_acceleration": [0, 6],
  "/cartesian_manager:rate_limiter.max_linear_acceleration": [0, 6],
  "/cartesian_manager:shapers.jaco.max_angular_velocity": [0, 1.2],
  "/petanque_throw:alpha": [0, 0.5],
  "/petanque_throw:angle_between_start_and_finish": [-0.5, 0.5],
  "/petanque_throw:total_duration": [0.5, 10],
};
// As safety.py reads the name: <= 0 switches a max velocity or acceleration off, a negative max speed is refused.
const POSITIVE_PARAMETER = /(^|\.)max_\w*(velocity|acceleration)$/;
const NON_NEGATIVE_PARAMETER = /(^|\.)max_\w*speed$/;

/** What the checks need beyond the widget; a list left undefined is not known, so it checks nothing. */
export type SendProblemContext = {
  /** The app's own teleop list, which a frame button's switch must pass. */
  appTeleopTargets?: readonly string[];
  commandFrameIds?: readonly string[];
  deploymentTeleopTargets?: readonly string[];
  robotName?: string | null;
  screens?: readonly { id: string; title: string }[];
  speedLimitCaps?: SpeedLimitCaps;
};

export function isMissingPayload(value: unknown): boolean {
  return value === undefined || value === null || value === "" || (isRecord(value) && Object.keys(value).length === 0);
}

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function effectiveSettings(widget: WidgetConfig): Record<string, unknown> {
  const normalized = normalizeWidgetSettings(widget.kind, widget.settings);
  return normalized.success ? normalized.settings : widget.settings;
}

/** An older app can carry a preset beside its own topic or frame; say which one the press sends. */
export function describePresetConflict(widget: WidgetConfig, presets: readonly RuntimeActionPreset[]): string | null {
  const { kind, settings } = widget;
  const presetId = readText(settings.presetId);
  const topic = readText(settings.topic);
  if (kind === "command-button" && presetId && settings.momentary === true) {
    const held = topic ? `its own topic ${topic}` : "its own topic, and it has none";
    return `This button names preset "${presetId}" and Hold to run. A held button sends only ${held}, never the preset. Clear Hold to run or the preset.`;
  }
  const hasBinding = isRecord(settings.runtime_binding);
  if (!presetId || (!topic && !hasBinding)) {
    return null;
  }
  const own = topic ? `its own topic ${topic}` : "its own runtime binding";
  if (kind === "toggle") {
    return `This toggle names preset "${presetId}", which a toggle ignores: it uses ${own}.`;
  }
  const sends = resolveWidgetPreset(widget, presets) ? "the preset" : `${own}, not the preset`;
  return `This button names preset "${presetId}" and ${own}. The press sends ${sends}; pick a purpose or clear the preset so only one remains.`;
}

/** Why a held button sends nothing: Hold to run publishes only on the button's own topic and type. */
export function describeHoldProblem(widget: WidgetConfig): string | null {
  const settings = effectiveSettings(widget);
  // With a preset, describePresetConflict already says what a hold sends.
  if (widget.kind !== "command-button" || settings.momentary !== true || readText(settings.presetId)) {
    return null;
  }
  const topic = readText(settings.topic);
  if (!topic || !readText(settings.messageType)) {
    return `Hold to run publishes on this button's own topic and message type, and it has no ${topic ? "message type" : "topic"}, so holding it sends nothing. Clear Hold to run.`;
  }
  // An empty Payload is describeCommandPayloadProblem's: a String hold sends its command, as a press does.
  return topic !== MODE_REQUEST_TOPIC && isMissingPayload(settings.releasedPayload)
    ? `Hold to run sends nothing on ${topic} when it is let go. Set "Payload on release" to what stops it.`
    : null;
}

/** A preset's type must match its kind: a service call names a .../srv/... type, a publish a message type. */
export function describePresetTypeProblem(preset: Pick<RuntimeActionPreset, "kind" | "message_type">): string | null {
  const type = preset.message_type.trim();
  const service = preset.kind === SERVICE_CALL_KIND;
  if (!type || type.includes("/srv/") === service) {
    return null;
  }
  return service
    ? `${type} is not a service type, so every call is refused. A service type reads like std_srvs/srv/SetBool.`
    : `${type} is a service type, so every publish is refused. Pick Service call as the preset kind.`;
}

/** A button's service-call preset with no service, no type, or a message type in place of one is always refused. */
function describeServicePresetProblem(widget: WidgetConfig, presets: readonly RuntimeActionPreset[]): string | null {
  const preset = resolveWidgetPreset(widget, presets);
  if (preset?.kind !== SERVICE_CALL_KIND) {
    return null;
  }
  const missing = [!preset.topic.trim() && "service", !preset.message_type.trim() && "service type"].filter(Boolean);
  if (missing.length > 0) {
    return `This button's preset "${preset.name}" names no ${missing.join(" and no ")}, so every press is refused. Set it under Reusable presets.`;
  }
  const typeProblem = describePresetTypeProblem(preset);
  return typeProblem ? `This button's preset "${preset.name}": ${typeProblem}` : null;
}

/** A plain publisher whose type is missing or not the one its topic carries is refused at press time. */
function describeMessageTypeProblem(widget: WidgetConfig, presets: readonly RuntimeActionPreset[]): string | null {
  const route = resolveWidgetRoute(widget, presets);
  const topic = route?.destination.direction === "publishes" ? route.destination.topic : null;
  if (!route || !topic || route.teleop || route.parameter || route.service || resolveWidgetPreset(widget, presets)) {
    return null;
  }
  const suggested = messageTypeSuggestionFor(topic);
  if (!route.messageType) {
    return widget.settings.momentary === true
      ? null
      : `${topic} has no message type here, so every send is refused. Set ROS message type${suggested ? ` to ${suggested}` : ""}.`;
  }
  return suggested && suggested !== route.messageType
    ? `${topic} carries ${suggested}, but this ${widget.kind === "toggle" ? "toggle" : "control"} sends ${route.messageType}, which the robot will not take. Set ROS message type to ${suggested}.`
    : null;
}

/** A button's own publish with no payload is refused, unless it is a String that sends its command instead. */
function describeCommandPayloadProblem(widget: WidgetConfig, presets: readonly RuntimeActionPreset[]): string | null {
  const settings = effectiveSettings(widget);
  const topic = readText(settings.topic);
  const messageType = readText(settings.messageType);
  if (widget.kind !== "command-button" || !topic || !messageType || !isMissingPayload(settings.payload)) {
    return null;
  }
  const intent = createWidgetActionIntent(widget, { type: "press" });
  const sendsOwnTopic =
    intent.type === "topic-publish" ||
    (intent.type === "command" && resolveCommandRoute(intent, presets).kind === "topic");
  if (!sendsOwnTopic) {
    return null;
  }
  if (messageType === STRING_MESSAGE_TYPE) {
    return readText(settings.command)
      ? null
      : `This button has no payload and no command, so every press on ${topic} is refused. Set Payload or Command.`;
  }
  return `This button has no payload for ${messageType}, so every press on ${topic} is refused. Set Payload.`;
}

function describeTogglePayloadProblems(widget: WidgetConfig): string[] {
  if (widget.kind !== "toggle" || !readToggleTopic(widget.settings)) {
    return [];
  }
  // An emptied payload saves "", which the server refuses as surely as a missing one sends nothing.
  return (["on", "off"] as const).flatMap((state) => {
    const field = state === "on" ? "onPayload" : "offPayload";
    const unsent = createWidgetActionIntent(widget, { nextState: state, type: "toggle" }).type === "unsupported";
    return unsent || (field in widget.settings && isMissingPayload(widget.settings[field]))
      ? [`This toggle has no ${state.toUpperCase()} payload, so switching it ${state} sends nothing.`]
      : [];
  });
}

/** A toggle with its own topic publishes there, and one without sends only a parameter binding. */
function describeToggleBindingProblem(widget: WidgetConfig): string | null {
  const binding = asRecord(widget.settings.runtime_binding);
  if (widget.kind !== "toggle" || Object.keys(binding).length === 0) {
    return null;
  }
  const topic = readToggleTopic(widget.settings);
  if (topic) {
    return `This toggle publishes ${topic}; its runtime binding is ignored. Clear the topic or the binding.`;
  }
  const mapping = asRecord(binding.value_mapping);
  const sendable = binding.adapter === "parameter" && readText(mapping.node) && readText(mapping.parameter);
  return sendable
    ? null
    : "A toggle sends only its own topic or a parameter binding naming a node and a parameter, so this binding sends nothing. Set an Output topic.";
}

/** The message types the server takes for what a slider or gesture pad sends as `data`. */
function describeValueTypeProblem(widget: WidgetConfig, presets: readonly RuntimeActionPreset[]): string | null {
  if (widget.kind !== "slider" && widget.kind !== "gesture-pad") {
    return null;
  }
  const route = resolveWidgetRoute(widget, presets);
  const type = route?.messageType;
  const settings = effectiveSettings(widget);
  const mapping = asRecord(asRecord(settings.runtime_binding).value_mapping);
  const fieldPath = readText(mapping.field_path) || readText(mapping.field) || "data";
  if (!route || !type || route.teleop || route.parameter || fieldPath !== "data") {
    return null;
  }
  if (widget.kind === "gesture-pad") {
    return type === STRING_MESSAGE_TYPE
      ? null
      : `A gesture pad sends its angle and power as text, which ${type} does not take, so every gesture is refused. Set ROS message type to ${STRING_MESSAGE_TYPE}.`;
  }
  if (FLOAT_MESSAGE_TYPES.has(type)) {
    return null;
  }
  if (INTEGER_MESSAGE_TYPES.has(type)) {
    const segments = Array.isArray(settings.segment_values) ? settings.segment_values : [];
    const whole = [settings.min, settings.step, ...segments].every(
      (value) => typeof value === "number" && Number.isInteger(value),
    );
    return whole
      ? null
      : `${type} takes whole numbers, and this slider's minimum, step or segments hold fractions, so those values are refused. Make them whole numbers, or set ROS message type to std_msgs/msg/Float64.`;
  }
  return `A slider sends a number, which ${type} does not take, so every move is refused. Set ROS message type to std_msgs/msg/Float64.`;
}

/** A slider bound to a parameter the server bounds, reaching outside the bounds. */
function describeParameterBoundsProblem(widget: WidgetConfig, presets: readonly RuntimeActionPreset[]): string | null {
  const parameter = widget.kind === "slider" ? resolveWidgetRoute(widget, presets)?.parameter : null;
  if (!parameter) {
    return null;
  }
  const settings = effectiveSettings(widget);
  const segments = Array.isArray(settings.segment_values) ? settings.segment_values : [];
  const values = [
    ["Minimum", settings.min],
    ["Maximum", settings.max],
    // The contract fills an initial 0 nobody wrote; only an authored one is judged.
    ["Initial value", widget.settings.value],
    ...segments.map((value, index) => [`Segment ${index + 1}`, value] as const),
  ].filter((entry): entry is [string, number] => typeof entry[1] === "number");
  const name = parameter.slice(parameter.indexOf(":") + 1);
  const bounds = PARAMETER_BOUNDS[parameter];
  const floor = POSITIVE_PARAMETER.test(name) ? "above 0" : NON_NEGATIVE_PARAMETER.test(name) ? "0 or more" : null;
  const refused = values.filter(
    ([, value]) =>
      (bounds !== undefined && (value < bounds[0] || value > bounds[1])) ||
      (floor === "above 0" && value <= 0) ||
      (floor === "0 or more" && value < 0),
  );
  if (refused.length === 0) {
    return null;
  }
  const range = [bounds ? `from ${bounds[0]} to ${bounds[1]}` : null, floor].filter(Boolean).join(" and ");
  return `This robot takes ${name} only ${range}, so ${refused.map(([label, value]) => `${label} (${value})`).join(", ")} will be refused. Keep the range within it.`;
}

/** A pad, slider or frame button naming a frame the robot does not accept has every move or switch blocked. */
export function describeWidgetFrameProblem(
  widget: WidgetConfig,
  commandFrameIds: readonly string[] | undefined,
): string | null {
  const binding = asRecord(widget.settings.runtime_binding);
  const buttonFrame = widget.kind === "command-button" ? resolveTeleopFrameId(binding) : null;
  if (buttonFrame) {
    if (!commandFrameIds || commandFrameIds.includes(buttonFrame) || !sendsTeleopFrame(widget)) {
      return null;
    }
    const takes = commandFrameIds.length > 0 ? ` (it takes ${commandFrameIds.join(", ")})` : "";
    return `This button switches to ${buttonFrame}, which this robot does not accept${takes}, so every press is blocked. Pick another frame under What this button does.`;
  }
  const frameId = readText(asRecord(binding.value_mapping).frame_id);
  if (!commandFrameIds || binding.adapter !== "teleop" || !frameId || commandFrameIds.includes(frameId)) {
    return null;
  }
  const accepted = commandFrameIds.length > 0 ? ` (it takes ${commandFrameIds.join(", ")})` : "";
  return `This control turns the hand in ${frameId}, which this robot does not accept${accepted}, so every move is blocked. Pick another frame under Turns in.`;
}

/** Whether a press really switches the frame: a preset or a screen can take the press first. */
function sendsTeleopFrame(widget: WidgetConfig, presets: readonly RuntimeActionPreset[] = []): boolean {
  const intent = createWidgetActionIntent(widget, { type: "press" });
  return intent.type === "command" && resolveCommandRoute(intent, presets).kind === "teleop-frame";
}

/** A frame switch goes out as a teleop command on the manager's input, which both teleop lists must allow. */
function describeFrameButtonTargetProblem(
  widget: WidgetConfig,
  presets: readonly RuntimeActionPreset[],
  context: SendProblemContext,
): string | null {
  if (widget.kind !== "command-button" || !sendsTeleopFrame(widget, presets)) {
    return null;
  }
  const refusedBy = [
    [context.appTeleopTargets, "this app's teleop list; add it under Adapter guardrails"],
    [context.deploymentTeleopTargets, "this robot's server; the lab's deployment settings must allow it"],
  ].find(([list]) => Array.isArray(list) && !allowlistAllows(list as readonly string[], TELEOP_DEFAULT_TARGET));
  return refusedBy
    ? `This button switches the frame through ${TELEOP_DEFAULT_TARGET}, which is not allowed by ${refusedBy[1]}.`
    : null;
}

/** Every mode request a control sends: its press, its hold and let-go, or its ON and OFF. */
function collectModeRequests(
  widget: WidgetConfig,
  presets: readonly RuntimeActionPreset[],
): Array<{ payload: unknown; topic: string; when: string }> {
  const settings = effectiveSettings(widget);
  if (widget.kind === "toggle") {
    const topic = readToggleTopic(settings) ?? "";
    return isModeRequestTopic(topic)
      ? [
          { payload: settings.onPayload, topic, when: "switching it on" },
          { payload: settings.offPayload, topic, when: "switching it off" },
        ]
      : [];
  }
  if (widget.kind !== "command-button") {
    return [];
  }
  const intent = createWidgetActionIntent(widget, { type: "press" });
  const route = intent.type === "command" ? resolveCommandRoute(intent, presets) : null;
  const sent =
    route?.kind === "preset"
      ? { payload: route.preset.payload_text || route.preset.payload, topic: route.preset.topic }
      : intent.type === "topic-publish"
        ? intent
        : route?.kind === "topic"
          ? route.publish
          : null;
  if (!sent || !isModeRequestTopic(sent.topic)) {
    return [];
  }
  if (settings.momentary !== true || intent.type !== "topic-publish") {
    return [{ payload: sent.payload, topic: sent.topic, when: "every press" }];
  }
  // A /mode_request hold with no release payload lets go to Neutral, as the renderer does.
  const released = isMissingPayload(settings.releasedPayload) ? null : settings.releasedPayload;
  return [
    { payload: sent.payload, topic: sent.topic, when: "every hold" },
    ...(released === null ? [] : [{ payload: released, topic: sent.topic, when: "every let-go" }]),
  ];
}

const KINOVA_REFUSED_MODE = /^behaviour\/(joint_target\/home|pose_target\/.+)$/;

/** The manager's mode grammar, and the Kinova's refused targets, as the server checks them before publishing. */
function describeModeRequestProblems(
  widget: WidgetConfig,
  presets: readonly RuntimeActionPreset[],
  robotName: string | null | undefined,
): string[] {
  const kinova = robotFamily(robotName) === "kinova";
  return collectModeRequests(widget, presets).flatMap(({ payload, topic, when }) => {
    const data = readModeRequestData(payload);
    if (data === null) {
      return [];
    }
    const parsed = parseModeRequest(data);
    if (!parsed.ok) {
      return [
        `This control sends "${data}" on ${topic}, which the manager does not take (${parsed.error}), so ${when} is refused. Pick a purpose or fix the mode.`,
      ];
    }
    return kinova && KINOVA_REFUSED_MODE.test(parsed.normalized)
      ? [
          `This robot refuses ${parsed.normalized}: Go home and pose targets are not available on the Kinova (cartesian_manager#10), so ${when} is refused.`,
        ]
      : [];
  });
}

function describeSpeedCapProblem(widget: WidgetConfig, caps: SpeedLimitCaps | undefined): string | null {
  const settings = effectiveSettings(widget);
  return describeSpeedCapExcess(
    widget.kind,
    resolveWidgetDestination(widget.kind, settings),
    settings,
    caps ?? DEFAULT_SPEED_LIMIT_CAPS,
  );
}

/** Whether a button navigates: it names a screen, or the navigate command. */
export function isNavigationButton(widget: WidgetConfig): boolean {
  return (
    widget.kind === "command-button" &&
    (readText(widget.settings.targetScreenId) !== "" || readText(widget.settings.command) === NAVIGATE_SCREEN_COMMAND)
  );
}

function describeNavigationProblem(widget: WidgetConfig, screens: SendProblemContext["screens"]): string | null {
  if (!isNavigationButton(widget)) {
    return null;
  }
  const target = readText(widget.settings.targetScreenId);
  if (!target) {
    return `This button opens no screen, so each press sends ${NAVIGATE_SCREEN_COMMAND} to the robot, which refuses it. Pick one under Opens screen.`;
  }
  return screens && !screens.some((screen) => screen.id === target)
    ? `This button opens screen "${target}", which this app does not have, so pressing it does nothing. Pick another under Opens screen.`
    : null;
}

/** Every reason a control would fail, or send something else, at press time. The checklist fails on any. */
export function describeWidgetSendProblems(
  widget: WidgetConfig,
  presets: readonly RuntimeActionPreset[],
  context: SendProblemContext = {},
): string[] {
  if (!SENDING_KINDS.has(widget.kind)) {
    return [];
  }
  const normalized = normalizeWidgetSettings(widget.kind, widget.settings);
  if (!normalized.success) {
    const errors = normalized.errors.map((error) => `${error.field}: ${error.message}`).join("; ");
    return [`These settings are invalid (${errors}), so this widget sends nothing. Fix them below.`];
  }
  return [
    describeNavigationProblem(widget, context.screens),
    describePresetConflict(widget, presets),
    describeServicePresetProblem(widget, presets),
    describeHoldProblem(widget),
    describeToggleBindingProblem(widget),
    describeMessageTypeProblem(widget, presets),
    describeValueTypeProblem(widget, presets),
    describeParameterBoundsProblem(widget, presets),
    describeCommandPayloadProblem(widget, presets),
    ...describeTogglePayloadProblems(widget),
    ...describeModeRequestProblems(widget, presets, context.robotName),
    describeSpeedCapProblem(widget, context.speedLimitCaps),
    context.commandFrameIds && widget.kind === "command-button"
      ? describeWidgetFrameProblem(widget, context.commandFrameIds)
      : null,
    describeFrameButtonTargetProblem(widget, presets, context),
  ].filter((problem): problem is string => problem !== null);
}
