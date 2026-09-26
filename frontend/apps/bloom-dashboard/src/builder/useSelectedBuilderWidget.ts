import type { ScreenConfig, WidgetConfig } from "@bloom/api-client";
import { useEffect, useState } from "react";

export type SelectedBuilderWidget = {
  selectedWidget: WidgetConfig | null;
  selectedWidgetId: string | null;
  setSelectedWidgetId: (widgetId: string | null) => void;
};

/** Nothing is selected until the author picks a widget; a removed widget leaves no selection. */
export function useSelectedBuilderWidget(screen: ScreenConfig): SelectedBuilderWidget {
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedWidgetId((currentWidgetId) =>
      currentWidgetId && screen.widgets.some((widget) => widget.id === currentWidgetId) ? currentWidgetId : null,
    );
  }, [screen]);

  const selectedWidget = screen.widgets.find((widget) => widget.id === selectedWidgetId) ?? null;

  return {
    selectedWidget,
    selectedWidgetId: selectedWidget?.id ?? null,
    setSelectedWidgetId,
  };
}
