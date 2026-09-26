import type { RuntimeActionPreset } from "@bloom/api-client";
import { resolveTeleopFrameId, type TopicPublishIntent, type WidgetActionIntent } from "@bloom/widgets";
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

/** Where a command press goes. The Builder's inspector and checklist read the same answer. */
export type CommandRoute =
  | { kind: "preset"; preset: RuntimeActionPreset }
  | { kind: "teleop-frame"; frameId: string }
  | { kind: "topic"; publish: TopicPublishIntent }
  | { kind: "none" };

type CommandIntent = Extract<WidgetActionIntent, { type: "command" }>;

/** A preset picked by id, then the button's frame binding, then its own topic, then a preset sharing its command. */
export function resolveCommandRoute(intent: CommandIntent, presets: readonly RuntimeActionPreset[]): CommandRoute {
  const picked = intent.presetId ? presets.find((candidate) => candidate.id === intent.presetId) : undefined;
  if (picked) {
    return { kind: "preset", preset: picked };
  }
  const frameId = resolveTeleopFrameId(intent.runtimeBinding);
  if (frameId) {
    return { kind: "teleop-frame", frameId };
  }
  if (intent.fallback) {
    return { kind: "topic", publish: intent.fallback };
  }
  const byCommand = findActionPreset(intent, presets);
  return byCommand ? { kind: "preset", preset: byCommand } : { kind: "none" };
}

export async function dispatchCommandIntent(
  client: RuntimeActionClient,
  intent: CommandIntent,
  options: RuntimeActionDispatchOptions,
): Promise<RuntimeActionDispatchResult> {
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
