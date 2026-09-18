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
  commitScreenChange: (screen: ScreenConfig) => void;
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

      return {
        past: [...currentHistory.past, updateWidgetLayout(finalScreen, widgetId, startingLayout)],
        present: finalScreen,
        future: [],
      };
    });
  };

  const undo = () => {
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

  const commitScreenChange = (screen: ScreenConfig) => {
    setHistory((currentHistory) => {
      if (areScreensEqual(screen, currentHistory.present)) {
        return currentHistory;
      }

      return {
        past: [...currentHistory.past, currentHistory.present],
        present: screen,
        future: [],
      };
    });
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
    isDirty: !areScreensEqual(history.present, sourceScreen),
    previewWidgetLayout,
    redo,
    resetDraft,
    undo,
  };
}

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
