import type { RuntimeActionPreset, WidgetConfig, WidgetKind } from "@bloom/api-client";
import { resolveCommandRoute } from "./command-route";
import { createWidgetActionIntent } from "./runtime";
import { readOptionalString } from "./values";
import { resolveWidgetDestination } from "./widget-destination";

/**
 * The command line this control is equivalent to.
 *
 * A form is abstract; `ros2 topic pub` is a sentence someone can read, paste into a terminal and check
 * against a running robot — without the app, without a session, without asking anyone. It is also the
 * first thing to try when a control does nothing.
 *
 * It resolves the destination the way the runtime does, so a topic the runtime ignores does not appear
 * here either: the line is what will actually go out, not what was typed.
 */
export function buildCliPreview(
  kind: string,
  settings: Record<string, unknown> | undefined,
  payload: unknown,
  presets: readonly RuntimeActionPreset[] = [],
): string | null {
  // A button's press is resolved as the dispatcher resolves it: a preset it sends is the preset's line.
  if (kind === "command-button") {
    const widget = { id: "cli-preview", kind: kind as WidgetKind, settings: settings ?? {}, title: "" } as WidgetConfig;
    const intent = createWidgetActionIntent(widget, { type: "press" });
    const route = intent.type === "command" ? resolveCommandRoute(intent, presets) : null;
    if (route?.kind === "preset") {
      return buildPresetLine(route.preset);
    }
    if (intent.type !== "topic-publish" && route?.kind !== "topic") {
      return null;
    }
  }

  const destination = resolveWidgetDestination(kind, settings);
  if (destination?.direction !== "publishes" || !destination.topic) {
    return null;
  }

  const messageType = readOptionalString(settings?.messageType) ?? readOptionalString(settings?.message_type);
  if (!messageType) {
    return null;
  }

  const body = readPayloadText(payload);
  if (body === null) {
    return null;
  }

  return `ros2 topic pub -1 ${destination.topic} ${messageType} "${body.replaceAll('"', '\\"')}"`;
}

function buildPresetLine(preset: RuntimeActionPreset): string | null {
  const body = readPayloadText(preset.payload_text || preset.payload);
  return preset.kind === "topic-publish" && preset.topic && preset.message_type && body !== null
    ? `ros2 topic pub -1 ${preset.topic} ${preset.message_type} "${body.replaceAll('"', '\\"')}"`
    : null;
}

/** Payloads are held either as ROS text ("{data: [1.1]}") or as a real object. */
function readPayloadText(payload: unknown): string | null {
  if (typeof payload === "string") {
    return payload.trim() || null;
  }
  if (payload === undefined || payload === null) {
    return null;
  }
  try {
    return JSON.stringify(payload);
  } catch {
    return null;
  }
}
