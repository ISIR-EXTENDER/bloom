import type { ScreenConfig, WidgetLayout } from "@bloom/api-client";
import type { WidgetRenderDescriptor } from "@bloom/widgets";
import type { ReactNode } from "react";
import { resolveScreenArtboardLayout, ScreenArtboard, type ScreenArtboardLayout } from "../screen/ScreenArtboard";
import { BuilderCanvasItem } from "./BuilderCanvasItem";

type BuilderCanvasProps = {
  onCommitWidgetLayout: (widgetId: string, startingLayout: WidgetLayout, finalLayout: WidgetLayout) => void;
  onPreviewWidgetLayout: (widgetId: string, layout: WidgetLayout) => void;
  onSelectWidget: (widgetId: string) => void;
  screen: ScreenConfig;
  selectedWidgetId: string | null;
};

export function BuilderCanvas({
  onCommitWidgetLayout,
  onPreviewWidgetLayout,
  onSelectWidget,
  screen,
  selectedWidgetId,
}: BuilderCanvasProps) {
  const { artboardSize } = resolveScreenArtboardLayout(screen);

  const renderEditableWidgetFrame = (descriptor: WidgetRenderDescriptor, content: ReactNode) => (
    <BuilderCanvasItem
      canvasSize={artboardSize}
      key={descriptor.widget.id}
      minSize={resolveWidgetMinSize(descriptor)}
      onCommitWidgetLayout={onCommitWidgetLayout}
      onPreviewWidgetLayout={onPreviewWidgetLayout}
      onSelectWidget={onSelectWidget}
      selected={descriptor.widget.id === selectedWidgetId}
      widget={descriptor.widget}
    >
      {content}
    </BuilderCanvasItem>
  );

  return (
    <div className="builder-canvas-viewport">
      <ScreenArtboard
        className="builder-canvas-artboard"
        renderBackground={(layout, renderedScreen) => <BuilderPresetTarget layout={layout} screen={renderedScreen} />}
        renderEmptyState={(emptyScreen) => <BuilderComingSoonMessage screen={emptyScreen} />}
        renderWidgetFrame={renderEditableWidgetFrame}
        screen={screen}
      />
    </div>
  );
}

function resolveWidgetMinSize(descriptor: WidgetRenderDescriptor) {
  if (descriptor.status === "resolved") {
    return {
      width: descriptor.definition.defaultLayout.minWidth,
      height: descriptor.definition.defaultLayout.minHeight,
    };
  }

  return {
    width: 40,
    height: 40,
  };
}

function BuilderComingSoonMessage({ screen }: { screen: ScreenConfig }) {
  return (
    <section className="builder-coming-soon" aria-label="Screen implementation coming soon">
      <p className="eyebrow">Coming soon</p>
      <h3>{screen.title} has no builder implementation yet.</h3>
      <p>
        This screen is already part of the application model. Once widgets are migrated or added, they will appear on
        this canvas without changing the app routing.
      </p>
    </section>
  );
}

function BuilderPresetTarget({ layout, screen }: { layout: ScreenArtboardLayout; screen: ScreenConfig }) {
  return (
    <div
      aria-hidden
      className="builder-canvas-target-zone"
      style={{
        height: `${layout.presetSize.height}px`,
        width: `${layout.presetSize.width}px`,
      }}
    >
      <span>{screen.canvas.preset_id}</span>
    </div>
  );
}
