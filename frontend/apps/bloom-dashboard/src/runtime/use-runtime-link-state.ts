import { useEffect, useState } from "react";

import type { RuntimeLinkState } from "./runtime-action-dispatcher";

const RECONNECT_INTERVAL_MS = 2000;

export type RuntimeLinkClient = {
  addRuntimeLinkStateListener?: (listener: (state: RuntimeLinkState) => void) => () => void;
  ensureRuntimeConnected?: () => Promise<void>;
};

export type RuntimeLinkSnapshot = {
  /** null while the client exposes no link at all (previews, tests). */
  state: RuntimeLinkState | null;
  /** Sticky once the link leaves its initial "connecting". */
  settled: boolean;
  /** Counts completed connections; a new socket carries no subscriptions. */
  connectionCount?: number;
};

/**
 * Watches the teleop link: connects eagerly (the socket is otherwise lazy)
 * and retries while down, so the chip tells the truth on an idle screen.
 */
export function useRuntimeLinkState(client: RuntimeLinkClient | null | undefined): RuntimeLinkSnapshot {
  const [snapshot, setSnapshot] = useState<RuntimeLinkSnapshot>({
    connectionCount: 0,
    settled: false,
    state: null,
  });

  useEffect(() => {
    const addListener = client?.addRuntimeLinkStateListener;
    if (!addListener) {
      return;
    }

    const removeListener = addListener((state) => {
      setSnapshot((current) => ({
        connectionCount:
          state === "connected" && current.state !== "connected"
            ? (current.connectionCount ?? 0) + 1
            : (current.connectionCount ?? 0),
        settled: current.settled || state !== "connecting",
        state,
      }));
    });
    client?.ensureRuntimeConnected?.().catch(() => {
      // The retry effect below owns what happens next.
    });

    return removeListener;
  }, [client]);

  useEffect(() => {
    const ensureConnected = client?.ensureRuntimeConnected;
    if (!ensureConnected || snapshot.state !== "disconnected") {
      return;
    }

    const timer = setInterval(() => {
      ensureConnected().catch(() => {
        // Still down; the interval fires again.
      });
    }, RECONNECT_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [client, snapshot.state]);

  return snapshot;
}
