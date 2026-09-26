import type { RuntimeActionPreset, RuntimeAdapterPolicy } from "@bloom/api-client";
import { asRecord, resolveTeleopFrameId, type WidgetActionIntent } from "@bloom/widgets";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  dispatchRuntimeActionIntent,
  isRuntimeActionConfirmed,
  isRuntimeActionProblem,
  type RuntimeActionClient,
  type RuntimeActionDispatchResult,
  type RuntimeTopicSubscriptionRequest,
} from "./runtime-action-dispatcher";
import type { RuntimeTeleopCommandRequest } from "./runtime-protocol";
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
  // The latest teleop sequence each widget contributed, so a late failure cannot withdraw a newer value.
  const latestTeleopSequenceByWidget = useRef(new Map<string, number>());
  const externalSourcesAwaitingNeutral = useRef(new Set<string>());
  const clientRef = useRef(client);
  clientRef.current = client;
  // Whoever draws the commanded motion, such as the 3D robot view, hears each twist as it goes out.
  const teleopCommandListeners = useRef(new Set<(request: RuntimeTeleopCommandRequest) => void>());
  const teleopRateGate = useRef<TeleopRateGate | null>(null);
  if (teleopRateGate.current === null) {
    teleopRateGate.current = new TeleopRateGate({
      refresh: (request) => ({ ...request, ...teleopComposer.current.compose() }),
      send: (request) => {
        const sendTeleopCommand = clientRef.current.sendTeleopCommand;
        if (!sendTeleopCommand) {
          return Promise.reject(new Error("Teleop client is gone."));
        }
        // Whoever watches a command must never be able to stop it: the arm comes first, the drawing after.
        for (const listener of teleopCommandListeners.current) {
          try {
            listener(request);
          } catch {
            // A listener that throws loses its arrow, not the command.
          }
        }
        return sendTeleopCommand(request);
      },
    });
  }
  const addTeleopCommandListener = useCallback((listener: (request: RuntimeTeleopCommandRequest) => void) => {
    teleopCommandListeners.current.add(listener);
    return () => {
      teleopCommandListeners.current.delete(listener);
    };
  }, []);
  // Keeps the composed twist alive past the manager's 0.2s input timeout.
  const teleopPump = useRef<TeleopStreamPump | null>(null);
  const pumpGaveUp = useRef(() => {});
  if (teleopPump.current === null) {
    teleopPump.current = new TeleopStreamPump({
      composer: teleopComposer.current,
      nextSequence: () => ++nextTeleopSequence.current,
      onGiveUp: () => pumpGaveUp.current(),
      send: (request) => teleopRateGate.current?.submit(request) ?? Promise.reject(new Error("Teleop gate is gone.")),
      unsettledMove: () => teleopRateGate.current?.unsettledMove ?? null,
    });
  }
  const [records, setRecords] = useState<RuntimeActionRecord[]>([]);
  const [feedback, setFeedback] = useState<RuntimeActionFeedback | null>(null);
  const [teleopActive, setTeleopActive] = useState(false);
  // Advances on every suspend so held controls can return to rest as well.
  const [neutralRevision, setNeutralRevision] = useState(0);
  // Between a suspend and the controls' return to rest, a pointermove could put the old push back into
  // the composer, and the pad, reset, would never send its zero. Teleop moves in that gap are dropped.
  const settlingAfterSuspend = useRef(false);
  useEffect(() => {
    void neutralRevision;
    settlingAfterSuspend.current = false;
  }, [neutralRevision]);
  const syncTeleopActive = useCallback(() => {
    setTeleopActive(!isZeroTwist(teleopComposer.current.compose()));
  }, []);
  // After a withdraw the wire must end on what the controls still hold, not on the withdrawn value.
  const submitComposedTwist = useCallback((base: RuntimeTeleopCommandRequest, sessionFrameId: string | undefined) => {
    const twist = teleopComposer.current.compose();
    const frameId = teleopComposer.current.resolveFrame(sessionFrameId ?? "").frameId;
    const request: RuntimeTeleopCommandRequest = {
      type: "teleop_cmd",
      angular: twist.angular,
      ...(frameId ? { frame_id: frameId } : {}),
      linear: twist.linear,
      mode: base.mode,
      seq: ++nextTeleopSequence.current,
      target: base.target,
    };
    teleopRateGate.current?.submit(request).then(
      (outcome) => {
        if (outcome.status !== "coalesced") {
          teleopPump.current?.noteDispatched(request, "sent", sessionFrameId);
        }
      },
      () => undefined,
    );
  }, []);

  const dispatch = useCallback(
    (intent: WidgetActionIntent, options: RuntimeDispatchOptions = {}) => {
      if (
        settlingAfterSuspend.current &&
        intent.type === "value-change" &&
        asRecord(intent.runtimeBinding).adapter === "teleop" &&
        !isRestingValue(intent.value)
      ) {
        return Promise.resolve({
          detail: "Dropped: the controls are returning to rest.",
          intent,
          status: "blocked" as const,
        });
      }
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
      if (intent.type === "value-change" && teleopSequence !== undefined) {
        latestTeleopSequenceByWidget.current.set(intent.widgetId, teleopSequence);
      }

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
          // The widget shows rest after a refused value, so the composed twist must not keep carrying it.
          const sessionFrameId = options.runtimePolicy?.command_frame_id;
          let withdrawn = false;
          if (isRuntimeActionProblem(result) && intent.type === "value-change") {
            const latestSequences = latestTeleopSequenceByWidget.current;
            if (latestSequences.get(intent.widgetId) === teleopSequence) {
              latestSequences.delete(intent.widgetId);
              teleopComposer.current.release(intent.widgetId);
              withdrawn = true;
            }
          }
          teleopPump.current?.noteDispatched(
            result.request,
            isRuntimeActionProblem(result) ? "failed" : "sent",
            sessionFrameId,
          );
          if (withdrawn && result.status !== "unsupported" && allowsTarget(options.runtimePolicy, result.request)) {
            submitComposedTwist(result.request, sessionFrameId);
          }
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
    [client, submitComposedTwist, syncTeleopActive],
  );

  const subscribeTopic = useCallback(
    (request: RuntimeTopicSubscriptionRequest) => {
      // A failed subscription leaves the widget blank; the next socket asks again.
      client.subscribeRuntimeTopic?.(request).catch(() => undefined);
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
        frame_id: commandFrameId,
        target: "/joystick_cartesian_command",
        mode: 0,
      });
    },
    [syncTeleopActive],
  );

  const suspendTeleop = useCallback(() => {
    // Only a source that was actually pushing has something to release. A gamepad already at rest emits
    // its next null only after a contribution, so arming it here swallowed the operator's whole next
    // push and taught them the stick needs a second one.
    for (const sourceId of teleopComposer.current.activeWidgetIds) {
      if (externalSources.current.has(sourceId)) {
        externalSourcesAwaitingNeutral.current.add(sourceId);
      }
    }
    teleopComposer.current.clear();
    settlingAfterSuspend.current = true;
    teleopRateGate.current?.discardPending();
    void teleopPump.current?.suspend().catch(() => undefined);
    syncTeleopActive();
    setNeutralRevision((revision) => revision + 1);
  }, [syncTeleopActive]);
  pumpGaveUp.current = suspendTeleop;

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
    addTeleopCommandListener,
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

function allowsTarget(policy: RuntimeAdapterPolicy | undefined, request: RuntimeTeleopCommandRequest): boolean {
  const allowed = policy?.allowed_teleop_targets;
  return !allowed || allowed.includes("*") || allowed.includes(request.target);
}

function isRestingValue(value: unknown): boolean {
  if (typeof value === "number") return value === 0;
  if (value && typeof value === "object" && "x" in value && "y" in value) {
    return (value as { x: number }).x === 0 && (value as { y: number }).y === 0;
  }
  return false;
}
