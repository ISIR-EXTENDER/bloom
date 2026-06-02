import type { WidgetActionIntent } from "@bloom/widgets";
import { useRef, useState } from "react";
import {
  dispatchRuntimeActionIntent,
  type RuntimeActionClient,
  type RuntimeActionDispatchResult,
} from "./runtime-action-dispatcher";

export type RuntimeActionRecordStatus = RuntimeActionDispatchResult["status"] | "pending";

export type RuntimeActionRecord = {
  detail: string;
  id: string;
  intent: WidgetActionIntent;
  request?: RuntimeActionDispatchResult["request"];
  status: RuntimeActionRecordStatus;
};

export function useRuntimeActionDispatcher(client: RuntimeActionClient) {
  const nextRecordIndex = useRef(0);
  const [records, setRecords] = useState<RuntimeActionRecord[]>([]);

  const dispatch = (intent: WidgetActionIntent) => {
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

    void dispatchRuntimeActionIntent(client, intent).then((result) => {
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
  };

  return { dispatch, records };
}

function createRecordId(intent: WidgetActionIntent, index: number): string {
  return `${intent.widgetId}-${intent.type}-${index}`;
}
