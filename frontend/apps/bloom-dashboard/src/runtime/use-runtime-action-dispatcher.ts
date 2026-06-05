import type { RuntimeAdapterPolicy } from "@bloom/api-client";
import type { WidgetActionIntent } from "@bloom/widgets";
import { useCallback, useRef, useState } from "react";
import {
  dispatchRuntimeActionIntent,
  type RuntimeActionClient,
  type RuntimeActionDispatchResult,
  type RuntimeTopicSubscriptionRequest,
} from "./runtime-action-dispatcher";

export type RuntimeActionRecordStatus = RuntimeActionDispatchResult["status"] | "pending";

export type RuntimeActionRecord = {
  detail: string;
  id: string;
  intent: WidgetActionIntent;
  request?: RuntimeActionDispatchResult["request"];
  status: RuntimeActionRecordStatus;
};

export type RuntimeDispatchOptions = {
  runtimePolicy?: RuntimeAdapterPolicy;
};

export function useRuntimeActionDispatcher(client: RuntimeActionClient) {
  const nextRecordIndex = useRef(0);
  const nextTeleopSequence = useRef(0);
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
        runtimePolicy: options.runtimePolicy,
        teleopSequence,
      }).then((result) => {
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
