import type { RosParameterSetRequest, RuntimeAdapterPolicy } from "@bloom/api-client";
import { beginAct, parameterTarget } from "@bloom/widget-renderers";
import { asRecord, readOptionalNumber, readOptionalString, type WidgetActionIntent } from "@bloom/widgets";
import {
  appScope,
  classifyDispatchError,
  isAllowedByPolicy,
  type RuntimeActionDispatchOptions,
  type RuntimeActionDispatchResult,
  toWidgetActionStatus,
} from "./dispatch-result";
import type { RuntimeActionClient } from "./runtime-protocol";

export async function dispatchParameterRequest(
  client: RuntimeActionClient,
  intent: WidgetActionIntent,
  request: RosParameterSetRequest,
  options: RuntimeActionDispatchOptions,
): Promise<RuntimeActionDispatchResult> {
  const policyError = validateParameterRequest(request, options.runtimePolicy);
  if (policyError) {
    return { intent, status: "blocked", detail: policyError };
  }
  if (!client.setRosParameter) {
    return { intent, status: "unsupported", detail: "Parameter intents need an API client before they can be sent." };
  }
  // ADR 0141: a set is an act on its parameter; no toggle's older retry may undo it.
  const settle = beginAct(parameterTarget(request.node, request.name), intent);
  let result: RuntimeActionDispatchResult;
  try {
    const response = await client.setRosParameter({ ...request, ...appScope(options) });
    result = { intent, status: response.status === "set" ? "published" : response.status, detail: response.detail };
  } catch (error: unknown) {
    result = { intent, ...classifyDispatchError(error) };
  }
  settle(toWidgetActionStatus(result));
  return result;
}

/**
 * A scalar bound to a node parameter: the live-tuning seam. cartesian_manager rereads its parameters
 * every tick, so a gain moves the moment the service answers; nothing here is a motion command.
 */
export function createParameterRequest(binding: unknown, value: unknown): RosParameterSetRequest | null {
  const runtimeBinding = asRecord(binding);
  if (readOptionalString(runtimeBinding.adapter) !== "parameter") {
    return null;
  }
  const valueMapping = asRecord(runtimeBinding.value_mapping);
  const node = readOptionalString(valueMapping.node);
  const name = readOptionalString(valueMapping.parameter);
  const scalar = typeof value === "boolean" ? value : readOptionalNumber(value);
  if (!node || !name || scalar === undefined) {
    return null;
  }
  return { node, name, value: scalar };
}

function validateParameterRequest(
  request: RosParameterSetRequest,
  policy: RuntimeAdapterPolicy | undefined,
): string | null {
  if (!policy) {
    return null;
  }
  // Unlike topics, an empty list allows none, as the backend reads it: an app names the parameters it tunes.
  const allowed = policy.allowed_parameters ?? [];
  if (allowed.length === 0 || !isAllowedByPolicy(`${request.node}:${request.name}`, allowed)) {
    return `Parameter "${request.node}:${request.name}" is not allowed by this app runtime policy.`;
  }
  return null;
}
