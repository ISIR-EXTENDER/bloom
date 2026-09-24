import type { BloomApiClient, RuntimeControlState } from "@bloom/api-client";

/** What crosses the runtime socket, and the client surface the runtime hooks drive. */
export type RuntimeVector3 = {
  x: number;
  y: number;
  z: number;
};

export type RuntimeTeleopCommandRequest = {
  angular: RuntimeVector3;
  /** Rotation frame for cartesian_manager; omitted uses the backend default. */
  frame_id?: string;
  linear: RuntimeVector3;
  mode: number;
  seq: number;
  target: string;
  type: "teleop_cmd";
};

export type RuntimeTeleopCommandResponse = {
  detail: string;
  payload: {
    angular: RuntimeVector3;
    frame_id: string;
    linear: RuntimeVector3;
    mode: number;
    seq: number;
    status: "accepted" | "simulated";
    target: string;
  };
  type: "teleop_ack";
};

export type RuntimeTopicSubscriptionRequest = {
  field_path: string;
  message_type: string;
  topic: string;
  type: "subscribe_topic";
  widget_id?: string;
};

export type RuntimeTopicSubscriptionResponse = {
  detail: string;
  payload: {
    field_path: string;
    message_type: string;
    topic: string;
    widget_id?: string;
  };
  type: "subscription_ack";
};

/** Names a subscription by the same widget_id and topic that opened it. */
export type RuntimeTopicUnsubscriptionRequest = {
  topic: string;
  type: "unsubscribe_topic";
  widget_id?: string;
};

export type RuntimeTopicUnsubscriptionResponse = {
  detail: string;
  payload: { removed: boolean; topic: string; widget_id?: string };
  type: "unsubscription_ack";
};

/** Names the app the socket is running, so its runtime policy applies to teleop too. */
export type RuntimeAppContextRequest = {
  app_id: string;
  config_id: string;
};

export type RuntimeAppContextResponse = {
  detail: string;
  payload: { allowed_teleop_targets: string[]; app_id: string; config_id: string };
  type: "app_context_ack";
};

export type RuntimeTopicSampleMessage = {
  detail: string;
  payload: {
    message_type: string;
    received_at: string;
    topic: string;
    value: unknown;
  };
  type: "topic_sample";
};

/** Teleop link state; "connecting" also covers "never asked yet". */
export type RuntimeLinkState = "connecting" | "connected" | "disconnected";

export type RuntimeActionClient = Pick<BloomApiClient, "publishRosTopic"> & {
  setRosParameter?: BloomApiClient["setRosParameter"];
  getRosParameters?: BloomApiClient["getRosParameters"];
  addRuntimeControlStateListener?: (listener: (state: RuntimeControlState | null) => void) => () => void;
  addRuntimeLinkStateListener?: (listener: (state: RuntimeLinkState) => void) => () => void;
  addRuntimeTopicSampleListener?: (listener: (sample: RuntimeTopicSampleMessage) => void) => () => void;
  deleteSavedPosition?: BloomApiClient["deleteSavedPosition"];
  disconnectRuntime?: () => void;
  dispatchRuntimeAction?: BloomApiClient["dispatchRuntimeAction"];
  exportSavedPositions?: BloomApiClient["exportSavedPositions"];
  listSavedPositions?: BloomApiClient["listSavedPositions"];
  saveSavedPosition?: BloomApiClient["saveSavedPosition"];
  engageRuntimeStop?: BloomApiClient["engageRuntimeStop"];
  ensureRuntimeConnected?: () => Promise<void>;
  getRuntimeStopState?: BloomApiClient["getRuntimeStopState"];
  getRuntimeControlState?: BloomApiClient["getRuntimeControlState"];
  getRuntimeSessionId?: () => string;
  listRosTopicStatus?: BloomApiClient["listRosTopicStatus"];
  listRosTopics?: BloomApiClient["listRosTopics"];
  listRuntimeAuditRecords?: BloomApiClient["listRuntimeAuditRecords"];
  listRuntimeCapabilities?: BloomApiClient["listRuntimeCapabilities"];
  resumeRuntimeStop?: BloomApiClient["resumeRuntimeStop"];
  claimRuntimeControl?: () => Promise<RuntimeControlState>;
  releaseRuntimeControl?: () => Promise<RuntimeControlState>;
  sendTeleopCommand?: (request: RuntimeTeleopCommandRequest) => Promise<RuntimeTeleopCommandResponse>;
  setRuntimeAppContext?: (request: RuntimeAppContextRequest) => Promise<RuntimeAppContextResponse>;
  startRuntimeRecording?: BloomApiClient["startRuntimeRecording"];
  stopRuntimeRecording?: BloomApiClient["stopRuntimeRecording"];
  subscribeRuntimeTopic?: (request: RuntimeTopicSubscriptionRequest) => Promise<RuntimeTopicSubscriptionResponse>;
  unsubscribeRuntimeTopic?: (request: RuntimeTopicUnsubscriptionRequest) => Promise<RuntimeTopicUnsubscriptionResponse>;
};
