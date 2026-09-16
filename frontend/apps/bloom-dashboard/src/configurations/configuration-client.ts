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
  const runtimeWebSocketClient = createRuntimeWebSocketClient({ url: resolveRuntimeWebSocketUrl(baseUrl) });
  const apiClient = createBloomApiClient({
    baseUrl,
    getRequestHeaders: () => {
      const headers = new Headers();
      const sessionId = runtimeWebSocketClient.getRuntimeSessionId();
      if (sessionId) {
        headers.set("X-Bloom-Runtime-Session", sessionId);
      }
      return headers;
    },
  });
  return {
    addRuntimeControlStateListener: runtimeWebSocketClient.addRuntimeControlStateListener,
    addRuntimeLinkStateListener: runtimeWebSocketClient.addRuntimeLinkStateListener,
    deleteSavedPosition: apiClient.deleteSavedPosition.bind(apiClient),
    disconnectRuntime: runtimeWebSocketClient.disconnectRuntime,
    exportSavedPositions: apiClient.exportSavedPositions.bind(apiClient),
    listSavedPositions: apiClient.listSavedPositions.bind(apiClient),
    saveSavedPosition: apiClient.saveSavedPosition.bind(apiClient),
    addRuntimeTopicSampleListener: runtimeWebSocketClient.addRuntimeTopicSampleListener,
    engageRuntimeStop: apiClient.engageRuntimeStop.bind(apiClient),
    ensureRuntimeConnected: runtimeWebSocketClient.ensureRuntimeConnected,
    getRuntimeControlState: apiClient.getRuntimeControlState.bind(apiClient),
    getRuntimeSessionId: runtimeWebSocketClient.getRuntimeSessionId,
    getRuntimeStopState: apiClient.getRuntimeStopState.bind(apiClient),
    listRosTopicStatus: apiClient.listRosTopicStatus.bind(apiClient),
    listRosTopics: apiClient.listRosTopics.bind(apiClient),
    listRuntimeAuditRecords: apiClient.listRuntimeAuditRecords.bind(apiClient),
    listRuntimeCapabilities: apiClient.listRuntimeCapabilities.bind(apiClient),
    dispatchRuntimeAction: apiClient.dispatchRuntimeAction.bind(apiClient),
    publishRosTopic: apiClient.publishRosTopic.bind(apiClient),
    claimRuntimeControl: runtimeWebSocketClient.claimRuntimeControl,
    releaseRuntimeControl: runtimeWebSocketClient.releaseRuntimeControl,
    resumeRuntimeStop: apiClient.resumeRuntimeStop.bind(apiClient),
    sendTeleopCommand: runtimeWebSocketClient.sendTeleopCommand,
    startRuntimeRecording: apiClient.startRuntimeRecording.bind(apiClient),
    stopRuntimeRecording: apiClient.stopRuntimeRecording.bind(apiClient),
    subscribeRuntimeTopic: runtimeWebSocketClient.subscribeRuntimeTopic,
  };
}

function getBloomApiBaseUrl(): string {
  return import.meta.env.VITE_BLOOM_API_URL ?? "";
}
