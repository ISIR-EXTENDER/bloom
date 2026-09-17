import type { RuntimeActionPreset, RuntimeAdapterPolicy } from "@bloom/api-client";
import { resolveTeleopFrameId, type WidgetActionIntent } from "@bloom/widgets";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  dispatchRuntimeActionIntent,
  isRuntimeActionConfirmed,
  isRuntimeActionProblem,
  type RuntimeActionClient,
  type RuntimeActionDispatchResult,
  type RuntimeTopicSubscriptionRequest,
} from "./runtime-action-dispatcher";
import { type ComponentContribution, isZeroTwist, TeleopTwistComposer } from "./teleop-composition";
import { TeleopRateGate } from "./teleop-rate-gate";
import { TeleopStreamPump } from "./teleop-stream";

export type RuntimeActionRecordStatus = RuntimeActionDispatchResult["status"] | "pending";

export type RuntimeActionRecord = {
  detail: string;
  id: string;
  intent: WidgetActionIntent;
  request?: RuntimeActionDispatchResult["request"];
  status: RuntimeActionRecordStatus;
};

export type RuntimeActionFeedback = {
  appId?: string;
  detail: string;
  status: Extract<RuntimeActionRecordStatus, "blocked" | "failed" | "simulated" | "unsupported">;
  widgetId: string;
};

export type RuntimeDispatchOptions = {
  actionPresets?: readonly RuntimeActionPreset[];
  allowedCommandFrameIds?: readonly string[];
  appId?: string;
  configId?: string;
  onCommandFrameChange?: (frameId: string) => void;
  runtimePolicy?: RuntimeAdapterPolicy;
};

export function useRuntimeActionDispatcher(client: RuntimeActionClient) {
  const nextRecordIndex = useRef(0);
  const nextTeleopSequence = useRef(0);
  // Composition is stateful: the twist sent when the Z slider moves must still
  // carry whatever the translation joystick is currently holding.
  const teleopComposer = useRef(new TeleopTwistComposer());
  const externalSources = useRef(new Set<string>());
  const externalSourcesAwaitingNeutral = useRef(new Set<string>());
  const clientRef = useRef(client);
  clientRef.current = client;
  const teleopRateGate = useRef<TeleopRateGate | null>(null);
  if (teleopRateGate.current === null) {
    teleopRateGate.current = new TeleopRateGate({
      send: (request) => {
        const sendTeleopCommand = clientRef.current.sendTeleopCommand;
        if (!sendTeleopCommand) {
          return Promise.reject(new Error("Teleop client is gone."));
        }
        return sendTeleopCommand(request);
      },
    });
  }
  // Keeps the composed twist alive past the manager's 0.2s input timeout.
  const teleopPump = useRef<TeleopStreamPump | null>(null);
  if (teleopPump.current === null) {
    teleopPump.current = new TeleopStreamPump({
      composer: teleopComposer.current,
      nextSequence: () => ++nextTeleopSequence.current,
      send: (request) => teleopRateGate.current?.submit(request) ?? Promise.reject(new Error("Teleop gate is gone.")),
    });
  }
  const [records, setRecords] = useState<RuntimeActionRecord[]>([]);
  const [feedback, setFeedback] = useState<RuntimeActionFeedback | null>(null);
  const [teleopActive, setTeleopActive] = useState(false);
  // Advances on every suspend so held controls can return to rest as well.
  const [neutralRevision, setNeutralRevision] = useState(0);
  const syncTeleopActive = useCallback(() => {
    setTeleopActive(!isZeroTwist(teleopComposer.current.compose()));
  }, []);

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

      const teleopSequence =
        intent.type === "value-change" ||
        (intent.type === "command" && resolveTeleopFrameId(intent.runtimeBinding) !== null)
          ? ++nextTeleopSequence.current
          : undefined;

      const pendingResult = dispatchRuntimeActionIntent(client, intent, {
        actionPresets: options.actionPresets,
        allowedCommandFrameIds: options.allowedCommandFrameIds,
        appId: options.appId,
        configId: options.configId,
        onCommandFrameChange: options.onCommandFrameChange,
        runtimePolicy: options.runtimePolicy,
        teleopComposer: teleopComposer.current,
        teleopCommandSender: client.sendTeleopCommand
          ? (request) => teleopRateGate.current?.submit(request) ?? Promise.reject(new Error("Teleop gate is gone."))
          : undefined,
        teleopSequence,
      });
      if (intent.type === "value-change") {
        syncTeleopActive();
      }

      return pendingResult.then((result) => {
        if (result.request && "type" in result.request && result.request.type === "teleop_cmd") {
          teleopPump.current?.noteDispatched(result.request, isRuntimeActionProblem(result) ? "failed" : "sent");
          syncTeleopActive();
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
        if (isRuntimeActionProblem(result)) {
          setFeedback({
            appId: options.appId,
            detail: result.detail,
            status: result.status,
            widgetId: intent.widgetId,
          });
        } else if (isRuntimeActionConfirmed(result)) {
          setFeedback((current) => (current?.widgetId === intent.widgetId ? null : current));
        }
        return result;
      });
    },
    [client, syncTeleopActive],
  );

  const subscribeTopic = useCallback(
    (request: RuntimeTopicSubscriptionRequest) => {
      void client.subscribeRuntimeTopic?.(request);
    },
    [client],
  );

  const clearFeedback = useCallback(() => setFeedback(null), []);

  /**
   * Feed a non-widget input source (a gamepad) into the same composed twist.
   *
   * It carries no widget intent, so it publishes through the pump rather than
   * the dispatcher: the pump already owns the streaming contract, and the
   * dispatch record list is for operator actions, not a stick at 20Hz.
   */
  const contributeTeleop = useCallback(
    (sourceId: string, contribution: ComponentContribution | null, commandFrameId = "") => {
      externalSources.current.add(sourceId);
      if (externalSourcesAwaitingNeutral.current.has(sourceId)) {
        if (contribution === null) {
          externalSourcesAwaitingNeutral.current.delete(sourceId);
          teleopComposer.current.release(sourceId);
          syncTeleopActive();
        }
        return;
      }

      if (contribution === null) {
        teleopComposer.current.release(sourceId);
      } else {
        teleopComposer.current.contribute(sourceId, contribution);
      }
      syncTeleopActive();
      teleopPump.current?.noteExternalContribution({
        ...(commandFrameId ? { frame_id: commandFrameId } : {}),
        target: "/joystick_cartesian_command",
        mode: 0,
      });
    },
    [syncTeleopActive],
  );

  const suspendTeleop = useCallback(() => {
    for (const sourceId of externalSources.current) {
      externalSourcesAwaitingNeutral.current.add(sourceId);
    }
    teleopComposer.current.clear();
    void teleopPump.current?.suspend().catch(() => undefined);
    syncTeleopActive();
    setNeutralRevision((revision) => revision + 1);
  }, [syncTeleopActive]);

  useEffect(() => {
    const suspendWhenHidden = () => {
      if (document.visibilityState === "hidden") {
        suspendTeleop();
      }
    };

    window.addEventListener("blur", suspendTeleop);
    window.addEventListener("pagehide", suspendTeleop);
    document.addEventListener("visibilitychange", suspendWhenHidden);
    return () => {
      window.removeEventListener("blur", suspendTeleop);
      window.removeEventListener("pagehide", suspendTeleop);
      document.removeEventListener("visibilitychange", suspendWhenHidden);
      suspendTeleop();
      teleopRateGate.current?.dispose();
    };
  }, [suspendTeleop]);

  return {
    clearFeedback,
    contributeTeleop,
    dispatch,
    feedback,
    neutralRevision,
    records,
    subscribeTopic,
    suspendTeleop,
    teleopActive,
  };
}

function createRecordId(intent: WidgetActionIntent, index: number): string {
  return `${intent.widgetId}-${intent.type}-${index}`;
}
