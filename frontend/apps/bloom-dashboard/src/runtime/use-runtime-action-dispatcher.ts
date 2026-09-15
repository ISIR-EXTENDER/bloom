import type { RuntimeActionPreset, RuntimeAdapterPolicy } from "@bloom/api-client";
import type { WidgetActionIntent } from "@bloom/widgets";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  dispatchRuntimeActionIntent,
  type RuntimeActionClient,
  type RuntimeActionDispatchResult,
  type RuntimeTopicSubscriptionRequest,
} from "./runtime-action-dispatcher";
import { TeleopTwistComposer } from "./teleop-composition";
import { TeleopStreamPump } from "./teleop-stream";

export type RuntimeActionRecordStatus = RuntimeActionDispatchResult["status"] | "pending";

export type RuntimeActionRecord = {
  detail: string;
  id: string;
  intent: WidgetActionIntent;
  request?: RuntimeActionDispatchResult["request"];
  status: RuntimeActionRecordStatus;
};

export type RuntimeDispatchOptions = {
  actionPresets?: readonly RuntimeActionPreset[];
  appId?: string;
  configId?: string;
  runtimePolicy?: RuntimeAdapterPolicy;
};

export function useRuntimeActionDispatcher(client: RuntimeActionClient) {
  const nextRecordIndex = useRef(0);
  const nextTeleopSequence = useRef(0);
  // Composition is stateful: the twist sent when the Z slider moves must still
  // carry whatever the translation joystick is currently holding.
  const teleopComposer = useRef(new TeleopTwistComposer());
  const clientRef = useRef(client);
  clientRef.current = client;
  // Keeps the composed twist alive between widget events: cartesian_manager
  // expires an input after 0.2s, and a slider only emits on value change, so
  // without this a held Z slider moved the arm for 0.2s and stopped.
  const teleopPump = useRef<TeleopStreamPump | null>(null);
  if (teleopPump.current === null) {
    teleopPump.current = new TeleopStreamPump({
      composer: teleopComposer.current,
      nextSequence: () => ++nextTeleopSequence.current,
      send: (request) => {
        const sendTeleopCommand = clientRef.current.sendTeleopCommand;
        if (!sendTeleopCommand) {
          return Promise.reject(new Error("Teleop client is gone."));
        }
        return sendTeleopCommand(request);
      },
    });
  }
  useEffect(() => {
    const pump = teleopPump.current;
    return () => pump?.stop();
  }, []);
  const [records, setRecords] = useState<RuntimeActionRecord[]>([]);

  const dispatch = useCallback(
    (intent: WidgetActionIntent, options: RuntimeDispatchOptions = {}) => {
      nextRecordIndex.current += 1;
      const recordId = createRecordId(intent, nextRecordIndex.current);
      setRecords((currentRecords) =>
        [
          {
            id: recordId,
            intent,
            status: "pending" as const,
            detail: "Dispatching runtime action...",
          },
          ...currentRecords,
        ].slice(0, 6),
      );

      const teleopSequence = intent.type === "value-change" ? ++nextTeleopSequence.current : undefined;

      void dispatchRuntimeActionIntent(client, intent, {
        actionPresets: options.actionPresets,
        appId: options.appId,
        configId: options.configId,
        runtimePolicy: options.runtimePolicy,
        teleopComposer: teleopComposer.current,
        teleopSequence,
      }).then((result) => {
        if (result.request && "type" in result.request && result.request.type === "teleop_cmd") {
          teleopPump.current?.noteDispatched(
            result.request,
            result.status === "failed" || result.status === "blocked" ? "failed" : "sent",
          );
        }
        setRecords((currentRecords) =>
          currentRecords.map((record) =>
            record.id === recordId
              ? {
                  ...record,
                  detail: result.detail,
                  request: result.request,
                  status: result.status,
                }
              : record,
          ),
        );
      });
    },
    [client],
  );

  const subscribeTopic = useCallback(
    (request: RuntimeTopicSubscriptionRequest) => {
      void client.subscribeRuntimeTopic?.(request);
    },
    [client],
  );

  return { dispatch, records, subscribeTopic };
}

function createRecordId(intent: WidgetActionIntent, index: number): string {
  return `${intent.widgetId}-${intent.type}-${index}`;
}
