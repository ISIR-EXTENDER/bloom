import type { RuntimeStopState } from "@bloom/api-client";

import type { RuntimeStatusChip } from "./RuntimeKioskBar";
import type { RuntimeLinkSnapshot } from "./use-runtime-link-state";

/**
 * One status word, ranked: STOPPED > LINK DOWN > READY. No chip on surfaces
 * with no runtime session behind them, where any word would be a guess.
 */
export function resolveRuntimeStatusChip(
  stopState: RuntimeStopState | null,
  link: RuntimeLinkSnapshot,
): RuntimeStatusChip | undefined {
  if (stopState?.stopped) {
    return { label: "STOPPED", tone: "stopped" };
  }

  if (link.state === null) {
    return undefined;
  }

  if (link.state === "connected") {
    return { label: "READY", tone: "ready" };
  }

  if (link.settled) {
    return { label: "LINK DOWN", tone: "link-down" };
  }

  return { label: "CONNECTING", tone: "connecting" };
}
