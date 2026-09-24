/**
 * Widget intents on their way to the robot. Each adapter has its own module; this decides which one
 * an intent belongs to and is what the runtime hooks and the tests import.
 */
import type { WidgetActionIntent } from "@bloom/widgets";
import { dispatchCommandIntent } from "./dispatch-commands";
import { createParameterRequest, dispatchParameterRequest } from "./dispatch-parameters";
import type { RuntimeActionDispatchOptions, RuntimeActionDispatchResult } from "./dispatch-result";
import { createTeleopCommandRequest, dispatchTeleopRequest } from "./dispatch-teleop";
import { createValueTopicPublishRequest, dispatchTopicPublishIntent, publishTopicRequest } from "./dispatch-topics";
import type { RuntimeActionClient } from "./runtime-protocol";

export type {
  RuntimeActionDispatchOptions,
  RuntimeActionDispatchResult,
  RuntimeActionDispatchStatus,
  RuntimeActionRequest,
  RuntimeConfiguredActionRequest,
} from "./dispatch-result";
export { isRuntimeActionConfirmed, isRuntimeActionProblem } from "./dispatch-result";
export { createTeleopCommandRequest } from "./dispatch-teleop";
export { createRosTopicPublishRequest, createValueTopicPublishRequest } from "./dispatch-topics";
export type * from "./runtime-protocol";

export async function dispatchRuntimeActionIntent(
  client: RuntimeActionClient,
  intent: WidgetActionIntent,
  options: RuntimeActionDispatchOptions = {},
): Promise<RuntimeActionDispatchResult> {
  if (intent.type === "topic-publish") {
    return dispatchTopicPublishIntent(client, intent, options);
  }

  if (intent.type === "value-change") {
    return dispatchValueChangeIntent(client, intent, options);
  }

  if (intent.type === "command") {
    return dispatchCommandIntent(client, intent, options);
  }

  if (intent.type === "toggle-state") {
    const request = createParameterRequest(intent.runtimeBinding, intent.value);
    if (request) {
      return dispatchParameterRequest(client, intent, request, options);
    }
  }

  return {
    intent,
    status: "unsupported",
    detail: `Runtime intent "${intent.type}" is not connected to a backend adapter yet.`,
  };
}

/** A slider, pad or toggle value reaches one adapter: the composed twist, a node parameter, or a topic. */
async function dispatchValueChangeIntent(
  client: RuntimeActionClient,
  intent: Extract<WidgetActionIntent, { type: "value-change" }>,
  options: RuntimeActionDispatchOptions,
): Promise<RuntimeActionDispatchResult> {
  const teleopRequest = createTeleopCommandRequest(
    intent,
    options.teleopSequence ?? 0,
    options.teleopComposer,
    options.runtimePolicy?.command_frame_id,
  );
  if (teleopRequest) {
    return dispatchTeleopRequest(client, intent, teleopRequest, options);
  }
  const parameterRequest = createParameterRequest(intent.runtimeBinding, intent.value);
  if (parameterRequest) {
    return dispatchParameterRequest(client, intent, parameterRequest, options);
  }
  const topicRequest = createValueTopicPublishRequest(intent);
  if (topicRequest) {
    return publishTopicRequest(client, intent, topicRequest, options);
  }
  return {
    intent,
    status: "unsupported",
    detail: "Value-change intents need a teleop or topic runtime binding before they can be sent.",
  };
}
