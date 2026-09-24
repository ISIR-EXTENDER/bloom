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
): string | null {
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
