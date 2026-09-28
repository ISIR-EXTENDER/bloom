import type { RuntimeActionPreset } from "@bloom/api-client";
import { beginAct } from "@bloom/widget-renderers";
import { NAVIGATE_SCREEN_COMMAND, resolveCommandRoute, type WidgetActionIntent } from "@bloom/widgets";
import {
  classifyDispatchError,
  type RuntimeActionDispatchOptions,
  type RuntimeActionDispatchResult,
  type RuntimeConfiguredActionRequest,
  toWidgetActionStatus,
} from "./dispatch-result";
import { dispatchTeleopFrameIntent } from "./dispatch-teleop";
import {
  createPresetTopicPublishRequest,
  createRosTopicPublishRequest,
  publishTopicRequest,
  validateTopicPublishRequest,
} from "./dispatch-topics";
import type { RuntimeActionClient } from "./runtime-protocol";

export { type CommandRoute, resolveCommandRoute } from "@bloom/widgets";

type CommandIntent = Extract<WidgetActionIntent, { type: "command" }>;

export async function dispatchCommandIntent(
  client: RuntimeActionClient,
  intent: CommandIntent,
  options: RuntimeActionDispatchOptions,
): Promise<RuntimeActionDispatchResult> {
  // A screen button whose screen is missing has nothing for the robot: the backend would only refuse it.
  if (intent.command === NAVIGATE_SCREEN_COMMAND) {
    return { intent, status: "unsupported", detail: "This button opens no screen: pick one under Opens screen." };
  }
  const route = resolveCommandRoute(intent, options.actionPresets ?? []);
  if (route.kind === "teleop-frame") {
    return dispatchTeleopFrameIntent(client, intent, route.frameId, options);
  }
  if (route.kind === "topic") {
    const fallbackRequest = createRosTopicPublishRequest(route.publish);
    return fallbackRequest
      ? publishTopicRequest(client, intent, fallbackRequest, options)
      : {
          intent,
          status: "unsupported",
          detail: "Topic publish intents need a ROS message type before they can be sent.",
        };
  }

  const preset = route.kind === "preset" ? route.preset : null;
  const request = preset ? createPresetTopicPublishRequest(preset) : null;
  const configuredActionRequest = createConfiguredActionRequest(intent, options, preset);
  if (configuredActionRequest && client.dispatchRuntimeAction) {
    let settle: ReturnType<typeof beginAct> = () => undefined;
    if (request) {
      const policyError = validateTopicPublishRequest(request, options.runtimePolicy);
      if (policyError) {
        return {
          intent,
          request,
          status: "blocked",
          detail: policyError,
        };
      }
      settle = beginAct(request.topic, intent);
    }

    let result: RuntimeActionDispatchResult;
    try {
      // A service call may take longer than a publish: the client picks its timeout by the preset's kind.
      const response = await client.dispatchRuntimeAction(
        {
          app_id: configuredActionRequest.app_id,
          command: configuredActionRequest.command,
          config_id: configuredActionRequest.config_id,
          preset_id: configuredActionRequest.preset_id,
        },
        { presetKind: preset?.kind },
      );
      result = { intent, request: configuredActionRequest, status: response.status, detail: response.detail };
    } catch (error: unknown) {
      result = { intent, request: configuredActionRequest, ...classifyDispatchError(error) };
    }
    settle(toWidgetActionStatus(result));
    return result;
  }

  if (!request) {
    return {
      intent,
      status: "unsupported",
      detail: `Command "${intent.command}" is not connected to a runtime adapter yet.`,
    };
  }

  return publishTopicRequest(client, intent, request, options);
}

function createConfiguredActionRequest(
  intent: CommandIntent,
  options: RuntimeActionDispatchOptions,
  preset: RuntimeActionPreset | null,
): RuntimeConfiguredActionRequest | null {
  if (!options.configId || !options.appId || (!preset?.id && !intent.command)) {
    return null;
  }

  return {
    type: "runtime_action",
    app_id: options.appId,
    command: preset?.command || intent.command,
    config_id: options.configId,
    preset_id: preset?.id ?? intent.presetId,
  };
}
