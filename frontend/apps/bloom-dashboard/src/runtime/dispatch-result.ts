import {
  BloomApiError,
  type RosTopicPublishRequest,
  type RuntimeActionPreset,
  type RuntimeAdapterPolicy,
} from "@bloom/api-client";
import type { WidgetActionStatus } from "@bloom/widget-renderers";
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
  | "superseded"
  | "transient"
  | "unknown"
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

export function isRuntimeActionProblem(result: RuntimeActionDispatchResult): result is RuntimeActionDispatchResult & {
  status: "blocked" | "failed" | "simulated" | "transient" | "unknown" | "unsupported";
} {
  return (
    result.status === "blocked" ||
    result.status === "failed" ||
    result.status === "simulated" ||
    result.status === "transient" ||
    result.status === "unknown" ||
    result.status === "unsupported"
  );
}

/** ADR 0141: only "unknown" means nobody knows whether the robot applied it; a coalesced teleop tick counts as taken. */
export function toWidgetActionStatus(result: RuntimeActionDispatchResult): WidgetActionStatus {
  if (isRuntimeActionConfirmed(result) || result.status === "coalesced") {
    return "accepted";
  }
  if (result.status === "superseded" || result.status === "transient" || result.status === "unknown") {
    return result.status;
  }
  return "refused";
}

/**
 * ADR 0141, what a failed request means for the robot. Applied, maybe: no reply, a 504, or a service that did not
 * answer in time. Not applied but worth retrying: a rate limit. Not applied, final: every other answer (STOP
 * latched, not the owner, forbidden, invalid). A 409 "superseded" lost to a newer send.
 */
export function classifyDispatchError(error: unknown): {
  detail: string;
  status: "failed" | "superseded" | "transient" | "unknown";
} {
  if (!(error instanceof BloomApiError)) {
    return { detail: getErrorMessage(error), status: "unknown" };
  }
  if (error.status === 409 && error.code === "superseded") {
    return { detail: "A newer command on this target was already applied.", status: "superseded" };
  }
  const detail = getErrorMessage(error);
  if (error.status === 429) {
    return { detail, status: "transient" };
  }
  if (error.status === 504 || (error.status === 503 && /did not answer/i.test(error.responseText))) {
    return { detail, status: "unknown" };
  }
  return { detail, status: "failed" };
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
