import type { ScreenConfig } from "@bloom/api-client";
import { renderScreenWidgets, renderWidgetDescriptor, type ScreenRendererOptions } from "@bloom/widget-renderers";
import {
  createDefaultWidgetRegistry,
  renderScreenDescriptors,
  resolveCanvasArtboardSize,
  resolveCanvasPresetSize,
  type WidgetRenderDescriptor,
} from "@bloom/widgets";
import type { CSSProperties, ReactNode } from "react";

const widgetRegistry = createDefaultWidgetRegistry();

export type ScreenArtboardLayout = ReturnType<typeof resolveScreenArtboardLayout>;

export type ScreenArtboardProps = {
  className: string;
  renderEmptyState: (screen: ScreenConfig) => ReactNode;
  renderBackground?: (layout: ScreenArtboardLayout, screen: ScreenConfig) => ReactNode;
  renderWidgetFrame?: (descriptor: WidgetRenderDescriptor, content: ReactNode) => ReactNode;
  rendererOptions?: ScreenRendererOptions;
  screen: ScreenConfig;
  style?: CSSProperties;
  testId?: string;
};

export function ScreenArtboard({
  className,
  renderBackground,
  renderEmptyState,
  renderWidgetFrame,
  rendererOptions,
  screen,
  style,
  testId,
}: ScreenArtboardProps) {
  const layout = resolveScreenArtboardLayout(screen);
  const descriptors = renderScreenDescriptors(screen, widgetRegistry);
  const mergedStyle: CSSProperties = {
    height: `${layout.artboardSize.height}px`,
    width: `${layout.artboardSize.width}px`,
    ...style,
  };

  return (
    <div
      className={className}
      data-screen-renderer="screen-artboard"
      data-screen-id={screen.id}
      data-screen-empty={layout.isEmpty ? "true" : undefined}
      data-testid={testId}
      style={mergedStyle}
    >
      {renderBackground?.(layout, screen)}
      {layout.isEmpty ? renderEmptyState(screen) : null}
      {renderWidgetFrame
        ? descriptors.map((descriptor) =>
            renderWidgetFrame(descriptor, renderWidgetDescriptor(descriptor, rendererOptions)),
          )
        : renderScreenWidgets(descriptors, rendererOptions)}
    </div>
  );
}

export function resolveScreenArtboardLayout(screen: ScreenConfig) {
  return {
    artboardSize: resolveCanvasArtboardSize(screen.widgets, screen.canvas),
    isEmpty: screen.widgets.length === 0,
    presetSize: resolveCanvasPresetSize(screen.canvas),
  };
}
