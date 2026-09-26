import type { ScreenConfig } from "@bloom/api-client";
import type { WidgetDataSnapshot } from "@bloom/widget-renderers";
import { useMemo, useRef } from "react";

import { applyPlotSelections, type PlotSelections } from "./plot-series-data";
import type { RuntimeTeleopCommandRequest } from "./runtime-protocol";
import { withRobotCommand } from "./runtime-topic-data";
import type { PositionLibraryState } from "./use-position-library";

type WidgetData = Record<string, WidgetDataSnapshot>;

/**
 * Topic data, plot picks, camera frames, the commanded twist and saved poses, merged per widget. Each input has its
 * own stage, and a widget whose snapshot did not change keeps its previous reference.
 */
export function useEffectiveWidgetData({
  cameraFrames,
  commandTwist,
  dataByWidgetId,
  plotSelections,
  positionLibrary,
  screen,
}: {
  cameraFrames: Readonly<WidgetData>;
  commandTwist: RuntimeTeleopCommandRequest | null;
  dataByWidgetId: Readonly<WidgetData>;
  plotSelections: PlotSelections;
  positionLibrary: PositionLibraryState | null;
  screen: ScreenConfig;
}): Readonly<WidgetData> {
  const plotData = useMemo(
    () => applyPlotSelections(screen, dataByWidgetId, plotSelections),
    [dataByWidgetId, plotSelections, screen],
  );
  const positionData = useMemo(() => {
    const entries: WidgetData = {};
    if (!positionLibrary) {
      return entries;
    }
    for (const widget of screen.widgets) {
      if (widget.kind !== "position-library") {
        continue;
      }
      const existing = dataByWidgetId[widget.id];
      entries[widget.id] = {
        type: "position-library",
        joints: existing?.type === "position-library" ? existing.joints : undefined,
        saved: positionLibrary.saved.map((pose) => ({
          name: pose.name,
          jointNames: pose.joint_names,
          positions: pose.positions,
          description: pose.description,
        })),
        exportYaml: positionLibrary.exportYaml || undefined,
        notice: positionLibrary.notice || undefined,
        busy: positionLibrary.busy,
      };
    }
    return entries;
  }, [dataByWidgetId, positionLibrary, screen]);
  const merged = useMemo(
    () => ({ ...withRobotCommand({ ...plotData, ...cameraFrames }, screen, commandTwist), ...positionData }),
    [cameraFrames, commandTwist, plotData, positionData, screen],
  );

  const previousRef = useRef<Readonly<WidgetData>>({});
  const previous = previousRef.current;
  let unchanged = Object.keys(previous).length === Object.keys(merged).length;
  const stable: WidgetData = {};
  for (const [widgetId, snapshot] of Object.entries(merged)) {
    const before = previous[widgetId];
    const kept = before !== undefined && sameSnapshot(before, snapshot, 4) ? before : snapshot;
    stable[widgetId] = kept;
    unchanged &&= kept === before;
  }
  const result = unchanged ? previous : stable;
  previousRef.current = result;
  return result;
}

/** Structural equality down to `depth`, then by reference: sample arrays are rebuilt, never mutated. */
function sameSnapshot(left: unknown, right: unknown, depth: number): boolean {
  if (Object.is(left, right)) {
    return true;
  }
  if (depth === 0 || typeof left !== "object" || typeof right !== "object" || left === null || right === null) {
    return false;
  }
  if (Array.isArray(left) !== Array.isArray(right)) {
    return false;
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const keys = Object.keys(leftRecord);
  if (keys.length !== Object.keys(rightRecord).length) {
    return false;
  }
  return keys.every((key) => key in rightRecord && sameSnapshot(leftRecord[key], rightRecord[key], depth - 1));
}
