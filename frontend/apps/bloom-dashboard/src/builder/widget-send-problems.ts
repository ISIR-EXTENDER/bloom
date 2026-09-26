import type { RuntimeActionPreset, WidgetConfig } from "@bloom/api-client";
import {
  createWidgetActionIntent,
  isRecord,
  messageTypeSuggestionFor,
  normalizeWidgetSettings,
  resolveCommandRoute,
} from "@bloom/widgets";
import { resolveWidgetPreset, resolveWidgetRoute } from "./widget-publish-route";

export const MODE_REQUEST_TOPIC = "/mode_request";
const STRING_MESSAGE_TYPE = "std_msgs/msg/String";

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
  return topic !== MODE_REQUEST_TOPIC && isMissingPayload(settings.releasedPayload)
    ? `Hold to run sends nothing on ${topic} when it is let go. Set "Payload on release" to what stops it.`
    : null;
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
  if (widget.kind !== "toggle" || !readText(widget.settings.topic)) {
    return [];
  }
  return (["on", "off"] as const).flatMap((state) => {
    const field = state === "on" ? "onPayload" : "offPayload";
    const unsent = createWidgetActionIntent(widget, { nextState: state, type: "toggle" }).type === "unsupported";
    return unsent && isMissingPayload(widget.settings[field])
      ? [`This toggle has no ${state.toUpperCase()} payload, so switching it ${state} sends nothing.`]
      : [];
  });
}

/** Every reason a button or toggle would fail, or send something else, at press time. The checklist fails on any. */
export function describeWidgetSendProblems(widget: WidgetConfig, presets: readonly RuntimeActionPreset[]): string[] {
  if (
    widget.kind !== "command-button" &&
    widget.kind !== "toggle" &&
    widget.kind !== "slider" &&
    widget.kind !== "gesture-pad"
  ) {
    return [];
  }
  return [
    describePresetConflict(widget, presets),
    describeHoldProblem(widget),
    describeMessageTypeProblem(widget, presets),
    describeCommandPayloadProblem(widget, presets),
    ...describeTogglePayloadProblems(widget),
  ].filter((problem): problem is string => problem !== null);
}
