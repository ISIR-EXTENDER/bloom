import type { RuntimeActionClient } from "./runtime-action-dispatcher";

export type SupervisorRuntimeClient = Pick<
  RuntimeActionClient,
  "addRuntimeLinkStateListener" | "ensureRuntimeConnected" | "getRuntimeStopState" | "listRosTopicStatus"
>;

/** Deliberately strips every command method before the supervisor UI sees the client. */
export function createSupervisorRuntimeClient(client: RuntimeActionClient): SupervisorRuntimeClient {
  return {
    addRuntimeLinkStateListener: client.addRuntimeLinkStateListener,
    ensureRuntimeConnected: client.ensureRuntimeConnected,
    getRuntimeStopState: client.getRuntimeStopState,
    listRosTopicStatus: client.listRosTopicStatus,
  };
}
