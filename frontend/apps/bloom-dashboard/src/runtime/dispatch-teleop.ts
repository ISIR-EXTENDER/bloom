import type { RuntimeAdapterPolicy } from "@bloom/api-client";
import {
  asRecord,
  clamp,
  isRecord,
  readOptionalNumber,
  readOptionalString,
  readValueMappingTopic,
  TELEOP_DEFAULT_TARGET,
  type Vector2Value,
  type WidgetActionIntent,
} from "@bloom/widgets";
import {
  getErrorMessage,
  type RuntimeActionDispatchOptions,
  type RuntimeActionDispatchResult,
} from "./dispatch-result";
import type { RuntimeActionClient, RuntimeTeleopCommandRequest, RuntimeVector3 } from "./runtime-protocol";
import {
  type ComponentContribution,
  composeTwist,
  contributionFromAxisMap,
  defaultJoystickAxisMap,
  isZeroTwist,
  readAxisDeadZone,
  readWidgetAxisMap,
  type TeleopTwistComposer,
} from "./teleop-composition";

/** A composed twist, judged against the frame list and the teleop policy before it leaves. */
export async function dispatchTeleopRequest(
  client: RuntimeActionClient,
  intent: Extract<WidgetActionIntent, { type: "value-change" }>,
  request: RuntimeTeleopCommandRequest,
  options: RuntimeActionDispatchOptions,
): Promise<RuntimeActionDispatchResult> {
  // The request was composed before it was judged. A refused one must leave the composer too, or its
  // value keeps riding on every later command from the widgets that are allowed.
  // A widget's own frame is judged too: in a conflict the request carries the session frame, and the refused
  // frame would ride out later, once the widget it conflicted with lets go.
  const widgetFrameId = readOptionalString(asRecord(asRecord(intent.runtimeBinding).value_mapping).frame_id) ?? "";
  const frameError =
    validateCommandFrameId(widgetFrameId, options.allowedCommandFrameIds) ??
    validateCommandFrameId(request.frame_id ?? "", options.allowedCommandFrameIds);
  if (frameError) {
    options.teleopComposer?.release(intent.widgetId);
    return {
      intent,
      request,
      status: "blocked",
      detail: frameError,
    };
  }
  const policyError = validateTeleopCommandRequest(request, options.runtimePolicy);
  if (policyError) {
    options.teleopComposer?.release(intent.widgetId);
    return {
      intent,
      request,
      status: "blocked",
      detail: policyError,
    };
  }

  if (!options.teleopCommandSender && !client.sendTeleopCommand) {
    return {
      intent,
      request,
      status: "unsupported",
      detail: "Teleop intents need a runtime WebSocket client before they can be sent.",
    };
  }

  try {
    if (options.teleopCommandSender) {
      const outcome = await options.teleopCommandSender(request);
      return {
        intent,
        request,
        status: outcome.status,
        detail: outcome.detail,
      };
    }
    if (!client.sendTeleopCommand) {
      return {
        intent,
        request,
        status: "unsupported",
        detail: "Teleop intents need a runtime WebSocket client before they can be sent.",
      };
    }
    const response = await client.sendTeleopCommand(request);
    return {
      intent,
      request,
      status: response.payload.status,
      detail: response.detail,
    };
  } catch (error: unknown) {
    return {
      intent,
      request,
      status: "failed",
      detail: getErrorMessage(error),
    };
  }
}

export async function dispatchTeleopFrameIntent(
  client: RuntimeActionClient,
  intent: Extract<WidgetActionIntent, { type: "command" }>,
  frameId: string,
  options: RuntimeActionDispatchOptions,
): Promise<RuntimeActionDispatchResult> {
  if (options.allowedCommandFrameIds && !options.allowedCommandFrameIds.includes(frameId)) {
    return {
      intent,
      status: "blocked",
      detail: `Command frame "${frameId}" is not available on this robot.`,
    };
  }
  if (!options.teleopComposer) {
    return {
      intent,
      status: "unsupported",
      detail: "Runtime frame selection needs the composed teleop state.",
    };
  }
  if (!isZeroTwist(options.teleopComposer.compose())) {
    return {
      intent,
      status: "blocked",
      detail: "Release every motion control before changing the command frame.",
    };
  }
  if (!options.onCommandFrameChange) {
    return {
      intent,
      status: "unsupported",
      detail: "Runtime frame selection is not connected to this operator session.",
    };
  }

  const request: RuntimeTeleopCommandRequest = {
    type: "teleop_cmd",
    angular: { x: 0, y: 0, z: 0 },
    frame_id: frameId,
    linear: { x: 0, y: 0, z: 0 },
    mode: 0,
    seq: options.teleopSequence ?? 0,
    target: "/joystick_cartesian_command",
  };
  const policyError = validateTeleopCommandRequest(request, options.runtimePolicy);
  if (policyError) {
    return { intent, request, status: "blocked", detail: policyError };
  }
  if (!options.teleopCommandSender && !client.sendTeleopCommand) {
    return {
      intent,
      request,
      status: "unsupported",
      detail: "Runtime frame selection needs a live teleop connection.",
    };
  }

  try {
    const outcome = options.teleopCommandSender
      ? await options.teleopCommandSender(request)
      : await client.sendTeleopCommand?.(request).then((response) => ({
          detail: response.detail,
          frameId: response.payload.frame_id,
          status: response.payload.status,
        }));
    if (!outcome) {
      throw new Error("Runtime frame selection did not receive a teleop acknowledgement.");
    }
    if (outcome.status !== "accepted") {
      return { intent, request, status: outcome.status, detail: outcome.detail };
    }
    if (outcome.frameId !== frameId) {
      return {
        intent,
        request,
        status: "failed",
        detail: `Backend acknowledged command frame "${outcome.frameId ?? "<missing>"}" instead of "${frameId}".`,
      };
    }

    options.onCommandFrameChange(frameId);
    return {
      intent,
      request,
      status: "accepted",
      detail: `Command frame changed to "${frameId}" for this operator session.`,
    };
  } catch (error: unknown) {
    return { intent, request, status: "failed", detail: getErrorMessage(error) };
  }
}

export function createTeleopCommandRequest(
  intent: Extract<WidgetActionIntent, { type: "value-change" }>,
  sequence = 0,
  composer?: TeleopTwistComposer,
  commandFrameId = "",
): RuntimeTeleopCommandRequest | null {
  const runtimeBinding = asRecord(intent.runtimeBinding);
  if (readOptionalString(runtimeBinding.adapter) !== "teleop") {
    return null;
  }

  const valueMapping = asRecord(runtimeBinding.value_mapping);
  const mode = readOptionalNumber(valueMapping.mode) ?? resolveTeleopMode(intent.modeId);
  const target = readValueMappingTopic(valueMapping) ?? TELEOP_DEFAULT_TARGET;
  /*
   * The frame a widget declares, resolved against everything else that is driving.
   *
   * ADR 0125 made the frame app-scoped so a composed twist could not mix interpretations, and left
   * `value_mapping.frame_id` as a fallback the session frame always shadowed. Robin, 2026-09-23,
   * asked whether the twist frame could be set per widget: it could be written and never reached.
   *
   * It is reachable now, because the invariant is narrower than it looked.
   * `InputManager::commandInBaseFrame` rotates only the angular part by the frame and passes the
   * linear part through untouched, so a translation pad in base and a rotation pad in the tool frame
   * never contradict each other. The composer decides, and keeps the session frame when two widgets
   * are turning the hand under different ones, which is the case that really cannot be honoured.
   */
  const widgetFrameId = readOptionalString(valueMapping.frame_id) ?? "";
  const sessionFrameId = commandFrameId.trim();

  const contribution = teleopContributionFromIntent(intent, runtimeBinding);
  if (!contribution) {
    return null;
  }

  // Without a composer, keep the historical single-widget behaviour so an app
  // that has not opted into axis mapping publishes exactly what it did before.
  if (!composer) {
    const twist = composeTwist([contribution]);
    const frameId = widgetFrameId || sessionFrameId;
    return {
      type: "teleop_cmd",
      angular: twist.angular,
      ...(frameId ? { frame_id: frameId } : {}),
      linear: twist.linear,
      mode,
      seq: sequence,
      target,
    };
  }

  // cartesian_manager replaces the latest command per source rather than
  // accumulating it, so every publish has to carry the whole twist.
  composer.contribute(intent.widgetId, contribution, widgetFrameId);
  const twist = composer.compose();
  const frameId = composer.resolveFrame(sessionFrameId).frameId;

  return {
    type: "teleop_cmd",
    angular: twist.angular,
    ...(frameId ? { frame_id: frameId } : {}),
    linear: twist.linear,
    mode,
    seq: sequence,
    target,
  };
}

/** Map one widget intent onto twist components, honouring `axis_mapping`. */
function teleopContributionFromIntent(
  intent: Extract<WidgetActionIntent, { type: "value-change" }>,
  runtimeBinding: Record<string, unknown>,
): ComponentContribution | null {
  const declared = readWidgetAxisMap(runtimeBinding, intent.modeId);
  // Opt-in per-axis dead zone matching joystick_mapper. Without it the previous
  // behaviour is preserved exactly.
  const deadZone = readAxisDeadZone(runtimeBinding);

  if (isVector2Value(intent.value)) {
    const axisMap = declared ?? defaultJoystickAxisMap(isRotationMode(intent.modeId));
    // Clamp to the unit disk before mapping, so a diagonal push cannot exceed
    // magnitude 1. This is a property of the touch surface rather than of the
    // mapping, and it is the long-standing joystick contract.
    const normalized = normalizeTeleopJoystickVector(intent.value);
    return contributionFromAxisMap(axisMap, { x: normalized.x, y: normalized.y }, deadZone);
  }

  // A scalar widget only reaches the twist when it says which component it
  // drives. Guessing would silently move an axis the operator did not choose.
  if (typeof intent.value === "number" && Number.isFinite(intent.value) && declared?.value) {
    return contributionFromAxisMap(declared, { value: intent.value }, deadZone);
  }

  return null;
}

function validateTeleopCommandRequest(
  request: RuntimeTeleopCommandRequest,
  policy: RuntimeAdapterPolicy | undefined,
): string | null {
  if (!policy) {
    return null;
  }
  // Empty means none here, not "no restriction". The backend narrows a socket to the app's own teleop
  // list and an app that declares none drives nothing, so reading empty as permissive let the screen
  // dispatch a command the server then refused -- the operator got "Command failed" from a control
  // that should never have been live.
  const allowed = policy.allowed_teleop_targets;
  if (allowed.includes("*") || allowed.includes(request.target)) {
    return null;
  }
  return `Teleop target "${request.target}" is not allowed by this app runtime policy.`;
}

function validateCommandFrameId(frameId: string, allowedCommandFrameIds: readonly string[] | undefined): string | null {
  if (!frameId || !allowedCommandFrameIds || allowedCommandFrameIds.includes(frameId)) {
    return null;
  }
  return `Command frame "${frameId}" is not available on this robot.`;
}

function resolveTeleopMode(modeId: string | undefined): number {
  const normalizedMode = normalizeModeId(modeId);
  if (normalizedMode === "rotation") {
    return 1;
  }
  if (normalizedMode === "translation") {
    return 2;
  }
  if (normalizedMode === "snake") {
    return 4;
  }
  return 3;
}

function isRotationMode(modeId: string | undefined): boolean {
  return normalizeModeId(modeId) === "rotation";
}

function normalizeModeId(modeId: string | undefined): string {
  return (modeId ?? "both").trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
}

function normalizeTeleopJoystickVector(value: Vector2Value): RuntimeVector3 {
  const x = toFiniteTeleopAxis(value.x);
  const y = toFiniteTeleopAxis(value.y);
  const magnitude = Math.hypot(x, y);

  if (magnitude <= 1) {
    return { x: clamp(x, -1, 1), y: clamp(y, -1, 1), z: 0 };
  }

  return {
    x: clamp(x / magnitude, -1, 1),
    y: clamp(y / magnitude, -1, 1),
    z: 0,
  };
}

function toFiniteTeleopAxis(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

export function isVector2Value(value: unknown): value is Vector2Value {
  return (
    isRecord(value) &&
    typeof value.x === "number" &&
    Number.isFinite(value.x) &&
    typeof value.y === "number" &&
    Number.isFinite(value.y)
  );
}
