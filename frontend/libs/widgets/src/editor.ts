import type { ScreenConfig, WidgetConfig, WidgetLayout } from "@bloom/api-client";
import type { WidgetDefinition } from "./index";
import { normalizeWidgetSettings } from "./settings";

export type AddWidgetOptions = {
  id: string;
  layout?: WidgetLayout;
  settings?: Record<string, unknown>;
  title?: string;
};

export type MoveWidgetOptions = {
  snapToGrid?: boolean;
};

export type ResizeWidgetOptions = {
  minHeight?: number;
  minWidth?: number;
  snapToGrid?: boolean;
};

const EDITOR_GRID_SIZE = 8;

export function addWidgetToScreen(
  screen: ScreenConfig,
  definition: WidgetDefinition,
  options: AddWidgetOptions,
): ScreenConfig {
  assertUniqueWidgetId(screen, options.id);
  return {
    ...screen,
    widgets: [...screen.widgets, createWidgetConfigFromDefinition(definition, options.id, options)],
  };
}

export function removeWidgetFromScreen(screen: ScreenConfig, widgetId: string): ScreenConfig {
  return {
    ...screen,
    widgets: screen.widgets.filter((widget) => widget.id !== widgetId),
  };
}

export function updateWidgetTitle(screen: ScreenConfig, widgetId: string, title: string): ScreenConfig {
  return updateWidget(screen, widgetId, (widget) => ({
    ...widget,
    title,
  }));
}

export function updateWidgetSettings(
  screen: ScreenConfig,
  widgetId: string,
  settings: Record<string, unknown>,
): ScreenConfig {
  return updateWidget(screen, widgetId, (widget) => {
    const normalizedSettings = normalizeWidgetSettings(widget.kind, settings);
    if (!normalizedSettings.success) {
      throw new Error(
        `Invalid settings for widget "${widgetId}": ${normalizedSettings.errors
          .map((error) => `${error.field}: ${error.message}`)
          .join("; ")}`,
      );
    }

    return {
      ...widget,
      settings: normalizedSettings.settings,
    };
  });
}

export function moveWidget(
  screen: ScreenConfig,
  widgetId: string,
  position: Pick<WidgetLayout, "x" | "y">,
  options: MoveWidgetOptions = {},
): ScreenConfig {
  return updateWidgetLayout(screen, widgetId, {
    x: resolveLayoutValue(position.x, options.snapToGrid),
    y: resolveLayoutValue(position.y, options.snapToGrid),
  });
}

export function resizeWidget(
  screen: ScreenConfig,
  widgetId: string,
  size: Pick<WidgetLayout, "height" | "width">,
  options: ResizeWidgetOptions = {},
): ScreenConfig {
  const minWidth = options.minWidth ?? 1;
  const minHeight = options.minHeight ?? 1;

  return updateWidgetLayout(screen, widgetId, {
    width: Math.max(minWidth, resolveLayoutValue(size.width, options.snapToGrid)),
    height: Math.max(minHeight, resolveLayoutValue(size.height, options.snapToGrid)),
  });
}

export function updateWidgetLayout(
  screen: ScreenConfig,
  widgetId: string,
  layout: Partial<WidgetLayout>,
): ScreenConfig {
  return updateWidget(screen, widgetId, (widget) => ({
    ...widget,
    layout: {
      ...widget.layout,
      ...layout,
    },
  }));
}

function updateWidget(
  screen: ScreenConfig,
  widgetId: string,
  update: (widget: WidgetConfig) => WidgetConfig,
): ScreenConfig {
  let foundWidget = false;
  const widgets = screen.widgets.map((widget) => {
    if (widget.id !== widgetId) {
      return widget;
    }
    foundWidget = true;
    return update(widget);
  });

  if (!foundWidget) {
    throw new Error(`Widget "${widgetId}" does not exist on screen "${screen.id}".`);
  }

  return {
    ...screen,
    widgets,
  };
}

function assertUniqueWidgetId(screen: ScreenConfig, widgetId: string): void {
  if (screen.widgets.some((widget) => widget.id === widgetId)) {
    throw new Error(`Widget "${widgetId}" already exists on screen "${screen.id}".`);
  }
}

function resolveLayoutValue(value: number, snapToGrid = false): number {
  return snapToGrid ? snapLayoutValue(value, EDITOR_GRID_SIZE) : value;
}

function createWidgetConfigFromDefinition(
  definition: WidgetDefinition,
  id: string,
  overrides: Partial<Pick<WidgetConfig, "layout" | "settings" | "title">> = {},
): WidgetConfig {
  const normalizedSettings = normalizeWidgetSettings(definition.kind, overrides.settings ?? {});
  if (!normalizedSettings.success) {
    throw new Error(
      `Invalid settings for widget kind "${definition.kind}": ${normalizedSettings.errors
        .map((error) => `${error.field}: ${error.message}`)
        .join("; ")}`,
    );
  }

  return {
    id,
    kind: definition.kind,
    title: overrides.title ?? definition.defaultTitle,
    layout: overrides.layout ?? {
      x: 0,
      y: 0,
      width: definition.defaultLayout.width,
      height: definition.defaultLayout.height,
    },
    settings: normalizedSettings.settings,
  };
}

function snapLayoutValue(value: number, gridSize: number): number {
  if (gridSize <= 0) {
    return value;
  }
  return Math.round(value / gridSize) * gridSize;
}
