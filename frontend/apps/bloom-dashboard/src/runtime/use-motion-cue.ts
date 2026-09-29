import type { WidgetDataSnapshot } from "@bloom/widget-renderers";
import { isOperatorWarning, type MotionLogEntry } from "@bloom/widgets";
import { useCallback, useEffect, useRef, useState } from "react";

export type MotionCueKind = "gripperStill" | "gripperWrongWay" | "handWrongWay";

/** The cue leaves on its own after this long: it reports a gesture that is over, it does not hold the robot. */
export const MOTION_CUE_MS = 30000;

export function motionCueKind(entry: MotionLogEntry): MotionCueKind | null {
  if (!isOperatorWarning(entry)) {
    return null;
  }
  if (entry.kind === "drive") {
    return "handWrongWay";
  }
  return entry.chip === "no-move" ? "gripperStill" : "gripperWrongWay";
}

/**
 * The newest wrong-way or did-not-move verdict since the cue was switched on, until dismissed or stale. Verdicts
 * already in the log when it starts watching are not news.
 */
export function useMotionCue(
  snapshot: WidgetDataSnapshot | undefined,
  enabled: boolean,
): { dismiss: () => void; kind: MotionCueKind } | null {
  const [cue, setCue] = useState<{ id: number; kind: MotionCueKind } | null>(null);
  const seenRef = useRef<number | null>(null);
  const log = snapshot?.type === "motion-check" ? snapshot.state.log : null;

  useEffect(() => {
    if (!enabled) {
      seenRef.current = null;
      setCue(null);
      return;
    }
    if (!log) {
      return;
    }
    const newest = log[0]?.id ?? 0;
    if (seenRef.current === null) {
      seenRef.current = newest;
      return;
    }
    const seen = seenRef.current;
    if (newest <= seen) {
      return;
    }
    seenRef.current = newest;
    const warning = log.find((entry) => entry.id > seen && motionCueKind(entry) !== null);
    const kind = warning ? motionCueKind(warning) : null;
    if (warning && kind) {
      setCue({ id: warning.id, kind });
    }
  }, [enabled, log]);

  useEffect(() => {
    if (!cue) {
      return;
    }
    const timer = setTimeout(() => setCue(null), MOTION_CUE_MS);
    return () => clearTimeout(timer);
  }, [cue]);

  const dismiss = useCallback(() => setCue(null), []);
  return cue ? { dismiss, kind: cue.kind } : null;
}
