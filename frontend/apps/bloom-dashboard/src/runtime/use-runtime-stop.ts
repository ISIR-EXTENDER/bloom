import type { RuntimeStopState } from "@bloom/api-client";
import { useCallback, useEffect, useRef, useState } from "react";

const STOP_STATE_POLL_MS = 2000;

/** All optional: a backend without the endpoints gets no STOP chrome. */
export type RuntimeStopClient = {
  engageRuntimeStop?: () => Promise<RuntimeStopState>;
  getRuntimeStopState?: () => Promise<RuntimeStopState>;
  resumeRuntimeStop?: () => Promise<RuntimeStopState>;
};

export type RuntimeStopHandle = {
  /** Latest backend-confirmed state, or null while unknown. */
  state: RuntimeStopState | null;
  requestError: string;
  /** STOP was pressed and the backend has not answered, or could not be told: motion stays refused. */
  stopRequested: boolean;
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
  const clientRef = useRef(client);
  clientRef.current = client;
  // Bumped by every STOP and resume: a poll sent before one answers with the latch as it was.
  const actionCountRef = useRef(0);

  const mirrorState = useCallback((next: RuntimeStopState) => {
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
    setStopRequested(true);
    engageRuntimeStop()
      .then((next) => {
        mirrorState(next);
        setStopRequested(false);
        setRequestError("");
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "The stop request failed.";
        const getState = clientRef.current?.getRuntimeStopState;
        if (!getState) {
          setRequestError(message);
          return;
        }
        getState()
          .then((next) => {
            mirrorState(next);
            // Not latched on the backend: the press still holds every control here until Resume.
            setStopRequested(!next.stopped);
            setRequestError(next.stopped && !next.asserted ? "" : message);
          })
          .catch(() => setRequestError(message));
      });
  }, [mirrorState]);

  const resume = useCallback(() => {
    const resumeRuntimeStop = clientRef.current?.resumeRuntimeStop;
    if (!resumeRuntimeStop) {
      return;
    }
    actionCountRef.current += 1;
    setStopRequested(false);
    resumeRuntimeStop()
      .then((next) => {
        mirrorState(next);
        setRequestError("");
      })
      .catch((error: unknown) => {
        setRequestError(error instanceof Error ? error.message : "The resume request failed.");
      });
  }, [mirrorState]);

  const assertionError = state?.stopped && !state.asserted ? state.detail : "";
  return { state, requestError: assertionError || requestError, stopRequested, engage, resume };
}
