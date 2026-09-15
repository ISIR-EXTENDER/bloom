import type { RuntimeStopState } from "@bloom/api-client";
import { useCallback, useEffect, useRef, useState } from "react";

const STOP_STATE_POLL_MS = 2000;

/**
 * The slice of the runtime client the stop control needs. All optional: a
 * backend too old to have the stop endpoints simply gets no STOP chrome,
 * rather than a button that would report success and do nothing -- the exact
 * failure the removed "Emergency stop" shipped with.
 */
export type RuntimeStopClient = {
  engageRuntimeStop?: () => Promise<RuntimeStopState>;
  getRuntimeStopState?: () => Promise<RuntimeStopState>;
  resumeRuntimeStop?: () => Promise<RuntimeStopState>;
};

export type RuntimeStopHandle = {
  /** Latest state the backend confirmed, or null while unknown. */
  state: RuntimeStopState | null;
  /** Why the last engage or resume request failed, or empty. The control must
   * surface this: a STOP that failed silently is worse than no STOP. */
  requestError: string;
  engage: () => void;
  resume: () => void;
};

/**
 * The stop latch, mirrored from the backend.
 *
 * The backend is the authority: this hook never flips `stopped` optimistically,
 * because the button's look is a safety claim -- "stopped" must mean the
 * backend latched, not that a request left the browser. The poll keeps the
 * mirror honest when another surface engages or resumes the same latch
 * (finding 13's supervisor is coming), at a cadence that costs nothing.
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
          // Keep the last confirmed state rather than clearing it: a failed
          // poll says the API is unreachable, not that the latch changed. The
          // link chip is what reports unreachability.
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
