import type { ScreenConfig, WidgetConfig } from "@bloom/api-client";
import { useEffect, useState } from "react";

export type SelectedBuilderWidget = {
  selectedWidget: WidgetConfig | null;
  selectedWidgetId: string | null;
  setSelectedWidgetId: (widgetId: string | null) => void;
};

export function useSelectedBuilderWidget(screen: ScreenConfig): SelectedBuilderWidget {
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(screen.widgets[0]?.id ?? null);

  useEffect(() => {
    setSelectedWidgetId((currentWidgetId) => {
      if (currentWidgetId && screen.widgets.some((widget) => widget.id === currentWidgetId)) {
        return currentWidgetId;
      }
      return screen.widgets[0]?.id ?? null;
    });
  }, [screen]);

  const selectedWidget = screen.widgets.find((widget) => widget.id === selectedWidgetId) ?? screen.widgets[0] ?? null;

  return {
    selectedWidget,
    selectedWidgetId: selectedWidget?.id ?? null,
    setSelectedWidgetId,
  };
}
