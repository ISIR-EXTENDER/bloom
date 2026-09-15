import type { RuntimeStopState } from "@bloom/api-client";

import type { RuntimeStatusChip } from "./RuntimeKioskBar";
import type { RuntimeLinkSnapshot } from "./use-runtime-link-state";

/**
 * One word, ranked by what the operator must know first (finding 3).
 *
 * STOPPED outranks LINK DOWN: the latch lives on the backend and holds whether
 * or not this browser's socket is alive, and an operator who just stopped the
 * arm must not watch the chip change the subject. LINK DOWN outranks READY for
 * the obvious reason -- it is the state this chip was created to make visible.
 * No chip at all is reserved for surfaces with no runtime session behind them
 * (builder previews), where a status word would be a guess.
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
