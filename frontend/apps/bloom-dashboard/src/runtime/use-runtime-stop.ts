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
  const clientRef = useRef(client);
  clientRef.current = client;

  useEffect(() => {
    const getState = client?.getRuntimeStopState;
    if (!getState) {
      return;
    }

    let cancelled = false;
    const refresh = () => {
      getState()
        .then((next) => {
          if (!cancelled) {
            setState(next);
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
  }, [client]);

  const engage = useCallback(() => {
    const engageRuntimeStop = clientRef.current?.engageRuntimeStop;
    if (!engageRuntimeStop) {
      return;
    }
    engageRuntimeStop()
      .then((next) => {
        setState(next);
        setRequestError("");
      })
      .catch((error: unknown) => {
        setRequestError(error instanceof Error ? error.message : "The stop request failed.");
      });
  }, []);

  const resume = useCallback(() => {
    const resumeRuntimeStop = clientRef.current?.resumeRuntimeStop;
    if (!resumeRuntimeStop) {
      return;
    }
    resumeRuntimeStop()
      .then((next) => {
        setState(next);
        setRequestError("");
      })
      .catch((error: unknown) => {
        setRequestError(error instanceof Error ? error.message : "The resume request failed.");
      });
  }, []);

  return { state, requestError, engage, resume };
}
