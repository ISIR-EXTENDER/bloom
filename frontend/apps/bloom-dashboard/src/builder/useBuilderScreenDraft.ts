import type { ScreenConfig, WidgetLayout } from "@bloom/api-client";
import { updateWidgetLayout } from "@bloom/widgets";
import { useEffect, useState } from "react";

type BuilderScreenDraftHistory = {
  future: ScreenConfig[];
  past: ScreenConfig[];
  present: ScreenConfig;
};

export type BuilderScreenDraft = {
  canRedo: boolean;
  canUndo: boolean;
  commitWidgetLayout: (widgetId: string, startingLayout: WidgetLayout, finalLayout: WidgetLayout) => void;
  draftScreen: ScreenConfig;
  isDirty: boolean;
  previewWidgetLayout: (widgetId: string, layout: WidgetLayout) => void;
  redo: () => void;
  resetDraft: () => void;
  undo: () => void;
};

export function useBuilderScreenDraft(sourceScreen: ScreenConfig): BuilderScreenDraft {
  const [history, setHistory] = useState<BuilderScreenDraftHistory>(() => createInitialHistory(sourceScreen));

  useEffect(() => {
    setHistory(createInitialHistory(sourceScreen));
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
        return currentHistory;
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

  const resetDraft = () => {
    setHistory(createInitialHistory(sourceScreen));
  };

  return {
    canRedo: history.future.length > 0,
    canUndo: history.past.length > 0,
    commitWidgetLayout,
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
