import {
  BloomApiError,
  type RosTopicPublishRequest,
  type RuntimeActionPreset,
  type RuntimeAdapterPolicy,
} from "@bloom/api-client";
import { isRecord, type WidgetActionIntent } from "@bloom/widgets";
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
  return allowedValues.length === 0 || allowedValues.includes("*") || allowedValues.includes(value);
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof BloomApiError) {
    // Surface the response body's reason, not just the status code.
    const detail = readBloomApiErrorDetail(error.responseText);
    return detail ? `${error.message} ${detail}` : error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Runtime action failed.";
}

function readBloomApiErrorDetail(responseText: string): string {
  if (!responseText) {
    return "";
  }
  try {
    const parsed = JSON.parse(responseText) as { detail?: unknown };
    if (typeof parsed.detail === "string") {
      return parsed.detail;
    }
    if (Array.isArray(parsed.detail)) {
      return parsed.detail
        .map((entry) => (isRecord(entry) && typeof entry.msg === "string" ? entry.msg : ""))
        .filter(Boolean)
        .join("; ");
    }
  } catch {
    return responseText.slice(0, 200);
  }
  return "";
}
