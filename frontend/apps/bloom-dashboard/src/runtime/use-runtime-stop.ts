import type { RuntimeStopState } from "@bloom/api-client";
import { useCallback, useEffect, useRef, useState } from "react";

const STOP_STATE_POLL_MS = 2000;

/** All optional: a backend without the endpoints gets no STOP chrome. */
export type RuntimeStopClient = {
  engageRuntimeStop?: () => Promise<RuntimeStopState>;
  getRuntimeStopState?: () => Promise<RuntimeStopState>;
  resumeRuntimeStop?: (latch?: { engagedAt?: string }) => Promise<RuntimeStopState>;
};

export type RuntimeStopHandle = {
  /** Latest backend-confirmed state, or null while unknown. */
  state: RuntimeStopState | null;
  requestError: string;
  /** STOP was pressed and the backend has not answered, or could not be told: motion stays refused. */
  stopRequested: boolean;
  /** The last STOP failed or the backend answered not stopped: STOP must be resendable. */
  engageUnconfirmed: boolean;
  engage: () => void;
  resume: () => void;
};

/**
 * Mirrors the backend's stop latch; never flips `stopped` optimistically.
 * The poll catches a latch changed from another surface.
 */
export function useRuntimeStop(client: RuntimeStopClient | null | undefined): RuntimeStopHandle {
  const [state, setState] = useState<RuntimeStopState | null>(null);
  const [requestError, setRequestError] = useState("");
  const [stopRequested, setStopRequested] = useState(false);
  const [engageUnconfirmed, setEngageUnconfirmed] = useState(false);
  const clientRef = useRef(client);
  clientRef.current = client;
  // Bumped by every STOP and resume: a poll sent before one answers with the latch as it was.
  const actionCountRef = useRef(0);
  const stateRef = useRef<RuntimeStopState | null>(null);

  const mirrorState = useCallback((next: RuntimeStopState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    const getState = client?.getRuntimeStopState;
    if (!getState) {
      return;
    }

    let cancelled = false;
    const refresh = () => {
      const actionsWhenSent = actionCountRef.current;
      getState()
        .then((next) => {
          if (!cancelled && actionsWhenSent === actionCountRef.current) {
            mirrorState(next);
            if (next.stopped) {
              setEngageUnconfirmed(false);
            }
          }
        })
        .catch(() => {
          // A failed poll means unreachable, not that the latch changed.
        });
    };

    refresh();
    const timer = setInterval(refresh, STOP_STATE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [client, mirrorState]);

  const engage = useCallback(() => {
    const engageRuntimeStop = clientRef.current?.engageRuntimeStop;
    if (!engageRuntimeStop) {
      return;
    }
    actionCountRef.current += 1;
    const actionsWhenSent = actionCountRef.current;
    // A Resume or another STOP since this one was sent owns the state now.
    const current = () => actionsWhenSent === actionCountRef.current;
    setStopRequested(true);
    engageRuntimeStop()
      .then((next) => {
        if (!current()) {
          return;
        }
        mirrorState(next);
        setStopRequested(false);
        setEngageUnconfirmed(false);
        setRequestError("");
      })
      .catch((error: unknown) => {
        if (!current()) {
          return;
        }
        const message = error instanceof Error ? error.message : "The stop request failed.";
        const getState = clientRef.current?.getRuntimeStopState;
        if (!getState) {
          setEngageUnconfirmed(true);
          setRequestError(message);
          return;
        }
        getState()
          .then((next) => {
            if (!current()) {
              return;
            }
            mirrorState(next);
            // Not latched on the backend: the press still holds every control here until Resume.
            setStopRequested(!next.stopped);
            setEngageUnconfirmed(!next.stopped);
            setRequestError(next.stopped && !next.asserted ? "" : message);
          })
          .catch(() => {
            if (current()) {
              setEngageUnconfirmed(true);
              setRequestError(message);
            }
          });
      });
  }, [mirrorState]);

  const resume = useCallback(() => {
    const resumeRuntimeStop = clientRef.current?.resumeRuntimeStop;
    if (!resumeRuntimeStop) {
      return;
    }
    // The latch on screen: a STOP pressed elsewhere since then is a new latch this resume must not release.
    const engagedAt = stateRef.current?.stopped ? stateRef.current.engaged_at : "";
    actionCountRef.current += 1;
    const actionsWhenSent = actionCountRef.current;
    const current = () => actionsWhenSent === actionCountRef.current;
    setStopRequested(false);
    setEngageUnconfirmed(false);
    resumeRuntimeStop(engagedAt ? { engagedAt } : undefined)
      .then((next) => {
        if (current()) {
          mirrorState(next);
          setRequestError("");
        }
      })
      .catch((error: unknown) => {
        if (!current()) {
          return;
        }
        const message = error instanceof Error ? error.message : "The resume request failed.";
        const getState = clientRef.current?.getRuntimeStopState;
        if (!engagedAt || (error as { status?: unknown } | null)?.status !== 409 || !getState) {
          setRequestError(message);
          return;
        }
        // 409 is also "not the owner": only a latch that moved on (a newer STOP, which stays) is answered silently.
        getState()
          .then((next) => {
            if (!current()) {
              return;
            }
            mirrorState(next);
            setRequestError(next.engaged_at !== engagedAt ? "" : message);
          })
          .catch(() => {
            if (current()) {
              setRequestError(message);
            }
          });
      });
  }, [mirrorState]);

  const assertionError = state?.stopped && !state.asserted ? state.detail : "";
  return { state, requestError: assertionError || requestError, stopRequested, engageUnconfirmed, engage, resume };
}
