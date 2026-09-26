import type { RosTopicPublishRequest, RuntimeActionPreset, RuntimeAdapterPolicy } from "@bloom/api-client";
import { allowlistAllows, type WidgetActionIntent } from "@bloom/widgets";
import { describeApiError } from "../ui/api-error";
import type { RuntimeTeleopCommandRequest } from "./runtime-protocol";
import type { TeleopTwistComposer } from "./teleop-composition";

export type RuntimeActionDispatchStatus =
  | "accepted"
  | "blocked"
  | "called"
  | "coalesced"
  | "failed"
  | "published"
  | "simulated"
  | "unsupported";

export type RuntimeConfiguredActionRequest = {
  app_id: string;
  command?: string;
  config_id: string;
  preset_id?: string;
  type: "runtime_action";
};

export type RuntimeActionRequest =
  | RosTopicPublishRequest
  | RuntimeConfiguredActionRequest
  | RuntimeTeleopCommandRequest;

export type RuntimeActionDispatchResult = {
  detail: string;
  intent: WidgetActionIntent;
  request?: RuntimeActionRequest;
  status: RuntimeActionDispatchStatus;
};

export function isRuntimeActionConfirmed(result: RuntimeActionDispatchResult): boolean {
  return result.status === "accepted" || result.status === "called" || result.status === "published";
}

export function isRuntimeActionProblem(
  result: RuntimeActionDispatchResult,
): result is RuntimeActionDispatchResult & { status: "blocked" | "failed" | "simulated" | "unsupported" } {
  return (
    result.status === "blocked" ||
    result.status === "failed" ||
    result.status === "simulated" ||
    result.status === "unsupported"
  );
}

export type RuntimeActionDispatchOptions = {
  actionPresets?: readonly RuntimeActionPreset[];
  allowedCommandFrameIds?: readonly string[];
  appId?: string;
  configId?: string;
  onCommandFrameChange?: (frameId: string) => void;
  runtimePolicy?: RuntimeAdapterPolicy;
  /**
   * Accumulates per-widget twist contributions so a full 6-DoF command can be
   * composed. Omitted keeps the historical single-widget behaviour.
   */
  teleopComposer?: TeleopTwistComposer;
  teleopCommandSender?: (request: RuntimeTeleopCommandRequest) => Promise<{
    detail: string;
    frameId?: string;
    status: "accepted" | "coalesced" | "simulated";
  }>;
  teleopSequence?: number;
};

export function isAllowedByPolicy(value: string, allowedValues: readonly string[]): boolean {
  return allowedValues.length === 0 || allowlistAllows(allowedValues, value);
}

export function getErrorMessage(error: unknown): string {
  return describeApiError(error, "Runtime action failed.");
}

/** Names the widget's app on a robot-facing request, so the backend applies that app's policy too. */
export function appScope(options: RuntimeActionDispatchOptions): { app_id?: string; config_id?: string } {
  return options.appId && options.configId ? { app_id: options.appId, config_id: options.configId } : {};
}
