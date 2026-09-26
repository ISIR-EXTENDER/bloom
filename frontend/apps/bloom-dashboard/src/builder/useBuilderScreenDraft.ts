import type { ScreenConfig, WidgetLayout } from "@bloom/api-client";
import { updateWidgetLayout } from "@bloom/widgets";
import { useEffect, useRef, useState } from "react";

type BuilderScreenDraftHistory = {
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
  isDirty: boolean;
  previewWidgetLayout: (widgetId: string, layout: WidgetLayout) => void;
  redo: () => void;
  resetDraft: () => void;
  undo: () => void;
};

export function useBuilderScreenDraft(sourceScreen: ScreenConfig): BuilderScreenDraft {
  const [history, setHistory] = useState<BuilderScreenDraftHistory>(() => createInitialHistory(sourceScreen));

  const editingScreenId = useRef(sourceScreen.id);
  const lastCommit = useRef<{ at: number; key: string } | null>(null);

  // Records this commit and says whether it continues the previous one.
  const continuesLastCommit = (key: string | undefined, withinMs = Number.POSITIVE_INFINITY) => {
    const now = Date.now();
    const previous = lastCommit.current;
    lastCommit.current = key ? { at: now, key } : null;
    return key !== undefined && previous?.key === key && now - previous.at <= withinMs;
  };

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
    const coalesces =
      !areLayoutsEqual(finalLayout, startingLayout) && continuesLastCommit(`layout:${widgetId}`, LAYOUT_COALESCE_MS);
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
      if (coalesces && currentHistory.past.length > 0) {
        return { ...currentHistory, present: finalScreen, future: [] };
      }

      return {
        past: [...currentHistory.past, updateWidgetLayout(finalScreen, widgetId, startingLayout)],
        present: finalScreen,
        future: [],
      };
    });
  };

  const undo = () => {
    lastCommit.current = null;
    setHistory((currentHistory) => {
      const previous = currentHistory.past.at(-1);
      if (!previous) {
        return currentHistory;
      }

      return {
        past: currentHistory.past.slice(0, -1),
        present: previous,
        future: [currentHistory.present, ...currentHistory.future],
      };
    });
  };

  const redo = () => {
    lastCommit.current = null;
    setHistory((currentHistory) => {
      const next = currentHistory.future[0];
      if (!next) {
        return currentHistory;
      }

      return {
        past: [...currentHistory.past, currentHistory.present],
        present: next,
        future: currentHistory.future.slice(1),
      };
    });
  };

  const commitScreenChange = (screen: ScreenConfig, coalesceKey?: string) => {
    const coalesces = continuesLastCommit(coalesceKey);
    setHistory((currentHistory) => {
      if (areScreensEqual(screen, currentHistory.present)) {
        return currentHistory;
      }
      if (coalesces && currentHistory.past.length > 0) {
        return { ...currentHistory, present: screen, future: [] };
      }

      return {
        past: [...currentHistory.past, currentHistory.present],
        present: screen,
        future: [],
      };
    });
  };

  const resetDraft = () => {
    lastCommit.current = null;
    setHistory(createInitialHistory(sourceScreen));
  };

  return {
    canRedo: history.future.length > 0,
    canUndo: history.past.length > 0,
    commitWidgetLayout,
    commitScreenChange,
    draftScreen: history.present,
    isDirty: !areScreensEqual(history.present, sourceScreen),
    previewWidgetLayout,
    redo,
    resetDraft,
    undo,
  };
}

const LAYOUT_COALESCE_MS = 1000;

function createInitialHistory(screen: ScreenConfig): BuilderScreenDraftHistory {
  return {
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
