import type { RuntimeStopState } from "@bloom/api-client";

import type { RuntimeStatusChip } from "./RuntimeKioskBar";
import { getRuntimeStrings, type RuntimeStrings } from "./strings";
import type { RuntimeLinkSnapshot } from "./use-runtime-link-state";

/**
 * One status word, ranked: STOPPED > LINK DOWN > READY. No chip on surfaces
 * with no runtime session behind them, where any word would be a guess.
 */
export function resolveRuntimeStatusChip(
  stopState: RuntimeStopState | null,
  link: RuntimeLinkSnapshot,
  strings: RuntimeStrings = getRuntimeStrings("en"),
): RuntimeStatusChip | undefined {
  if (stopState?.stopped) {
    return { label: strings.status.stopped, tone: "stopped" };
  }

  if (link.state === null) {
    return undefined;
  }

  if (link.state === "connected") {
    return { label: strings.status.ready, tone: "ready" };
  }

  if (link.settled) {
    return { label: strings.status.linkDown, tone: "link-down" };
  }

  return { label: strings.status.connecting, tone: "connecting" };
}
