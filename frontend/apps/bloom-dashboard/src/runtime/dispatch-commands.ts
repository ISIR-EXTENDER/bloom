import type { RuntimeActionPreset } from "@bloom/api-client";
import { resolveTeleopFrameId, type WidgetActionIntent } from "@bloom/widgets";
import {
  getErrorMessage,
  type RuntimeActionDispatchOptions,
  type RuntimeActionDispatchResult,
  type RuntimeConfiguredActionRequest,
} from "./dispatch-result";
import { dispatchTeleopFrameIntent } from "./dispatch-teleop";
import {
  createPresetTopicPublishRequest,
  createRosTopicPublishRequest,
  findActionPreset,
  publishTopicRequest,
  validateTopicPublishRequest,
} from "./dispatch-topics";
import type { RuntimeActionClient } from "./runtime-protocol";

export async function dispatchCommandIntent(
  client: RuntimeActionClient,
  intent: Extract<WidgetActionIntent, { type: "command" }>,
  options: RuntimeActionDispatchOptions,
): Promise<RuntimeActionDispatchResult> {
  // A preset picked by id outranks the button's frame binding and topic, which an older app may still carry.
  const pickedPreset = (options.actionPresets ?? []).find((candidate) => candidate.id === intent.presetId) ?? null;
  if (!pickedPreset) {
    const teleopFrameId = resolveTeleopFrameId(intent.runtimeBinding);
    if (teleopFrameId) {
      return dispatchTeleopFrameIntent(client, intent, teleopFrameId, options);
    }
    if (intent.fallback) {
      const fallbackRequest = createRosTopicPublishRequest(intent.fallback);
      return fallbackRequest
        ? publishTopicRequest(client, intent, fallbackRequest, options)
        : {
            intent,
            status: "unsupported",
            detail: "Topic publish intents need a ROS message type before they can be sent.",
          };
    }
  }

  const preset = pickedPreset ?? findActionPreset(intent, options.actionPresets ?? []);
  const request = preset ? createPresetTopicPublishRequest(preset) : null;
  const configuredActionRequest = createConfiguredActionRequest(intent, options, preset);
  if (configuredActionRequest && client.dispatchRuntimeAction) {
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
    }

    try {
      const response = await client.dispatchRuntimeAction({
        app_id: configuredActionRequest.app_id,
        command: configuredActionRequest.command,
        config_id: configuredActionRequest.config_id,
        preset_id: configuredActionRequest.preset_id,
      });
      return {
        intent,
        request: configuredActionRequest,
        status: response.status,
        detail: response.detail,
      };
    } catch (error: unknown) {
      return {
        intent,
        request: configuredActionRequest,
        status: "failed",
        detail: getErrorMessage(error),
      };
    }
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
  intent: Extract<WidgetActionIntent, { type: "command" }>,
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
