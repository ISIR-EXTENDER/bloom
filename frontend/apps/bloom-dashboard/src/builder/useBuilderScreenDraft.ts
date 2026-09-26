import type { ScreenConfig, WidgetLayout } from "@bloom/api-client";
import { updateWidgetLayout } from "@bloom/widgets";
import { useEffect, useRef, useState } from "react";

type BuilderScreenDraftHistory = {
  /** The key run that pushed the newest past step; only that run may merge into it. */
  coalesce: { at: number; key: string } | null;
  future: ScreenConfig[];
  past: ScreenConfig[];
  present: ScreenConfig;
};

export type BuilderScreenDraft = {
  canRedo: boolean;
  canUndo: boolean;
  commitWidgetLayout: (widgetId: string, startingLayout: WidgetLayout, finalLayout: WidgetLayout) => void;
  /** Changes sharing a `coalesceKey` back to back are one undo step, e.g. the keystrokes of one field. */
  commitScreenChange: (screen: ScreenConfig, coalesceKey?: string) => void;
  draftScreen: ScreenConfig;
  /** Ends the current coalescing run, e.g. when the author selects another widget. */
  endCoalescing: () => void;
  isDirty: boolean;
  previewWidgetLayout: (widgetId: string, layout: WidgetLayout) => void;
  redo: () => void;
  resetDraft: () => void;
  undo: () => void;
};

export function useBuilderScreenDraft(sourceScreen: ScreenConfig): BuilderScreenDraft {
  const [history, setHistory] = useState<BuilderScreenDraftHistory>(() => createInitialHistory(sourceScreen));

  const editingScreenId = useRef(sourceScreen.id);

  useEffect(() => {
    setHistory((currentHistory) => {
      // A different screen is a different editing session.
      if (editingScreenId.current !== sourceScreen.id) {
        editingScreenId.current = sourceScreen.id;
        return createInitialHistory(sourceScreen);
      }
      // The same screen arriving as a new object is what a resolved save looks like: the store replaces
      // the configuration and this effect runs again. Adopting it threw away anything authored while
      // the request was in flight, and cleared the history, so it could not even be undone.
      return areScreensEqual(currentHistory.present, sourceScreen)
        ? createInitialHistory(sourceScreen)
        : currentHistory;
    });
  }, [sourceScreen]);

  const previewWidgetLayout = (widgetId: string, layout: WidgetLayout) => {
    setHistory((currentHistory) => ({
      ...currentHistory,
      present: updateWidgetLayout(currentHistory.present, widgetId, layout),
    }));
  };

  const commitWidgetLayout = (widgetId: string, startingLayout: WidgetLayout, finalLayout: WidgetLayout) => {
    // Arrow nudges of one widget within a second are one step; a pointer drag rarely lands that fast.
    const now = Date.now();
    setHistory((currentHistory) => {
      if (areLayoutsEqual(finalLayout, startingLayout)) {
        // A refused drop lands back on the start, over whatever the last preview wrote, with no history entry.
        const current = currentHistory.present.widgets.find((widget) => widget.id === widgetId);
        if (!current || areLayoutsEqual(current.layout, startingLayout)) {
          return currentHistory;
        }
        return { ...currentHistory, present: updateWidgetLayout(currentHistory.present, widgetId, startingLayout) };
      }

      const finalScreen = updateWidgetLayout(currentHistory.present, widgetId, finalLayout);
      return pushOrMerge(
        currentHistory,
        finalScreen,
        updateWidgetLayout(finalScreen, widgetId, startingLayout),
        `layout:${widgetId}`,
        now,
        LAYOUT_COALESCE_MS,
      );
    });
  };

  const undo = () => {
    setHistory((currentHistory) => {
      const previous = currentHistory.past.at(-1);
      if (!previous) {
        return currentHistory;
      }

      return {
        coalesce: null,
        past: currentHistory.past.slice(0, -1),
        present: previous,
        future: [currentHistory.present, ...currentHistory.future],
      };
    });
  };

  const redo = () => {
    setHistory((currentHistory) => {
      const next = currentHistory.future[0];
      if (!next) {
        return currentHistory;
      }

      return {
        coalesce: null,
        past: [...currentHistory.past, currentHistory.present],
        present: next,
        future: currentHistory.future.slice(1),
      };
    });
  };

  const commitScreenChange = (screen: ScreenConfig, coalesceKey?: string) => {
    const now = Date.now();
    setHistory((currentHistory) =>
      areScreensEqual(screen, currentHistory.present)
        ? currentHistory
        : pushOrMerge(currentHistory, screen, currentHistory.present, coalesceKey, now, COALESCE_IDLE_MS),
    );
  };

  const endCoalescing = () => {
    setHistory((currentHistory) =>
      currentHistory.coalesce === null ? currentHistory : { ...currentHistory, coalesce: null },
    );
  };

  const resetDraft = () => {
    setHistory(createInitialHistory(sourceScreen));
  };

  return {
    canRedo: history.future.length > 0,
    canUndo: history.past.length > 0,
    commitWidgetLayout,
    commitScreenChange,
    draftScreen: history.present,
    endCoalescing,
    isDirty: !areScreensEqual(history.present, sourceScreen),
    previewWidgetLayout,
    redo,
    resetDraft,
    undo,
  };
}

const LAYOUT_COALESCE_MS = 1000;
const COALESCE_IDLE_MS = 1500;

function pushOrMerge(
  history: BuilderScreenDraftHistory,
  present: ScreenConfig,
  previous: ScreenConfig,
  key: string | undefined,
  now: number,
  withinMs: number,
): BuilderScreenDraftHistory {
  const coalesce = key === undefined ? null : { at: now, key };
  const run = history.coalesce;
  if (key !== undefined && run?.key === key && now - run.at <= withinMs && history.past.length > 0) {
    return { ...history, coalesce, present, future: [] };
  }
  return { coalesce, past: [...history.past, previous], present, future: [] };
}

function createInitialHistory(screen: ScreenConfig): BuilderScreenDraftHistory {
  return {
    coalesce: null,
    past: [],
    present: screen,
    future: [],
  };
}

function areLayoutsEqual(left: WidgetLayout, right: WidgetLayout): boolean {
  return left.x === right.x && left.y === right.y && left.width === right.width && left.height === right.height;
}

function areScreensEqual(left: ScreenConfig, right: ScreenConfig): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
