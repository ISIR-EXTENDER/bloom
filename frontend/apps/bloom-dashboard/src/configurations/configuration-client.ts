import { type BloomApiClient, createBloomApiClient } from "@bloom/api-client";
import type { RuntimeActionClient } from "../runtime/runtime-action-dispatcher";
import { createRuntimeWebSocketClient, resolveRuntimeWebSocketUrl } from "../runtime/runtime-websocket-client";

export type ConfigurationClient = Pick<
  BloomApiClient,
  | "deleteApplication"
  | "getConfiguration"
  | "listConfigurations"
  | "upsertApplication"
  | "upsertConfiguration"
  | "upsertScreen"
  | "uploadThemeAsset"
>;

export function createDashboardConfigurationClient(): ConfigurationClient {
  return createBloomApiClient({ baseUrl: getBloomApiBaseUrl() });
}

export function createDashboardRuntimeActionClient(): RuntimeActionClient {
  const baseUrl = getBloomApiBaseUrl();
  const apiClient = createBloomApiClient({ baseUrl });
  const runtimeWebSocketClient = createRuntimeWebSocketClient({ url: resolveRuntimeWebSocketUrl(baseUrl) });
  return {
    addRuntimeTopicSampleListener: runtimeWebSocketClient.addRuntimeTopicSampleListener,
    listRosTopics: apiClient.listRosTopics.bind(apiClient),
    listRuntimeAuditRecords: apiClient.listRuntimeAuditRecords.bind(apiClient),
    publishRosTopic: apiClient.publishRosTopic.bind(apiClient),
    sendTeleopCommand: runtimeWebSocketClient.sendTeleopCommand,
    startRuntimeRecording: apiClient.startRuntimeRecording.bind(apiClient),
    stopRuntimeRecording: apiClient.stopRuntimeRecording.bind(apiClient),
    subscribeRuntimeTopic: runtimeWebSocketClient.subscribeRuntimeTopic,
  };
}

function getBloomApiBaseUrl(): string {
  return import.meta.env.VITE_BLOOM_API_URL ?? "";
}
