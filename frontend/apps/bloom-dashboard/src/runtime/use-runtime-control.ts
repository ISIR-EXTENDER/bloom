import type { RuntimeControlState } from "@bloom/api-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { describeApiError } from "../ui/api-error";

import type { RuntimeActionClient } from "./runtime-action-dispatcher";

export type RuntimeControlSnapshot = {
  claiming: boolean;
  error: string;
  state: RuntimeControlState | null;
  supported: boolean;
};

type RuntimeControlClient = Pick<
  RuntimeActionClient,
  | "addRuntimeControlStateListener"
  | "claimRuntimeControl"
  | "disconnectRuntime"
  | "ensureRuntimeConnected"
  | "getRuntimeControlState"
  | "releaseRuntimeControl"
>;

const CONTROL_REFRESH_MS = 2000;

export function useRuntimeControl(
  client: RuntimeControlClient,
  onBeforeRelease: () => void,
): RuntimeControlSnapshot & { claim: () => Promise<void> } {
  const supported = Boolean(
    client.addRuntimeControlStateListener && client.claimRuntimeControl && client.releaseRuntimeControl,
  );
  const [state, setState] = useState<RuntimeControlState | null>(null);
  const stateRef = useRef<RuntimeControlState | null>(null);
  const stateRevisionRef = useRef(0);
  const onBeforeReleaseRef = useRef(onBeforeRelease);
  onBeforeReleaseRef.current = onBeforeRelease;
  const [claiming, setClaiming] = useState(supported);
  const [error, setError] = useState("");

  const claim = useCallback(async () => {
    if (!client.claimRuntimeControl) {
      return;
    }
    setClaiming(true);
    setError("");
    const requestedAtRevision = stateRevisionRef.current;
    try {
      const nextState = await client.claimRuntimeControl();
      if (requestedAtRevision === stateRevisionRef.current) {
        stateRevisionRef.current += 1;
        stateRef.current = nextState;
        setState(nextState);
      }
    } catch (claimError) {
      setError(describeApiError(claimError, "Bloom could not claim robot control."));
    } finally {
      setClaiming(false);
    }
  }, [client]);

  useEffect(() => {
    const addListener = client.addRuntimeControlStateListener;
    if (!addListener || !client.claimRuntimeControl || !client.releaseRuntimeControl) {
      setClaiming(false);
      return;
    }

    let active = true;
    let claimedSessionId = "";
    const removeListener = addListener((nextState) => {
      if (!active) {
        return;
      }
      stateRevisionRef.current += 1;
      stateRef.current = nextState;
      setState(nextState);
      if (nextState?.session_id && nextState.session_id !== claimedSessionId) {
        claimedSessionId = nextState.session_id;
        void claim();
      }
    });
    void client.ensureRuntimeConnected?.().catch(() => {
      if (active) {
        setClaiming(false);
      }
    });
    const refreshTimer = client.getRuntimeControlState
      ? window.setInterval(() => {
          const requestedAtRevision = stateRevisionRef.current;
          client
            .getRuntimeControlState?.()
            .then((nextState) => {
              if (active && requestedAtRevision === stateRevisionRef.current) {
                stateRevisionRef.current += 1;
                stateRef.current = nextState;
                setState(nextState);
              }
            })
            .catch(() => undefined);
        }, CONTROL_REFRESH_MS)
      : undefined;

    return () => {
      active = false;
      if (refreshTimer !== undefined) {
        window.clearInterval(refreshTimer);
      }
      removeListener();
      if (!stateRef.current?.is_owner) {
        client.disconnectRuntime?.();
        return;
      }
      try {
        onBeforeReleaseRef.current();
      } catch {
        // The backend release still owns final neutralization.
      }
      void Promise.resolve()
        .then(() => client.releaseRuntimeControl?.())
        .catch(() => undefined)
        .finally(() => client.disconnectRuntime?.());
    };
  }, [claim, client]);

  return { claim, claiming, error, state, supported };
}
