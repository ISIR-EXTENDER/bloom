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
  /**
   * Whether the link has ever left its initial "connecting". Reconnect
   * attempts pass through "connecting" every couple of seconds; a chip that
   * flickered CONNECTING/LINK DOWN in that loop would hide the one thing it
   * exists to say, so "connecting" after a settled link still reads as down.
   */
  settled: boolean;
};

/**
 * The teleop link, watched rather than inferred.
 *
 * The socket is created lazily on first send, so without the eager connect
 * here the chip would read "connecting" forever on a screen with no teleop
 * widget touched yet. And since a dropped link only reconnected on the next
 * send -- an operator staring at a dead screen would wait indefinitely -- this
 * hook also retries while the link is down.
 */
export function useRuntimeLinkState(client: RuntimeLinkClient | null | undefined): RuntimeLinkSnapshot {
  const [snapshot, setSnapshot] = useState<RuntimeLinkSnapshot>({ state: null, settled: false });

  useEffect(() => {
    const addListener = client?.addRuntimeLinkStateListener;
    if (!addListener) {
      return;
    }

    const removeListener = addListener((state) => {
      setSnapshot((current) => ({ state, settled: current.settled || state !== "connecting" }));
    });
    client?.ensureRuntimeConnected?.().catch(() => {
      // The listener already reported "disconnected"; the retry below owns
      // what happens next.
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
        // Still down. The interval fires again; the listener flips the state
        // the moment a connect succeeds, which clears this effect.
      });
    }, RECONNECT_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [client, snapshot.state]);

  return snapshot;
}
