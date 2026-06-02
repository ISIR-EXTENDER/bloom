import type { ScreenConfig, WidgetLayout } from "@bloom/api-client";
import { renderWidgetDescriptor } from "@bloom/widget-renderers";
import {
  createDefaultWidgetRegistry,
  renderScreenDescriptors,
  resolveCanvasArtboardSize,
  resolveCanvasPresetSize,
  type WidgetRenderDescriptor,
} from "@bloom/widgets";
import { BuilderCanvasItem } from "./BuilderCanvasItem";

const widgetRegistry = createDefaultWidgetRegistry();

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
  const descriptors = renderScreenDescriptors(screen, widgetRegistry);
  const artboardSize = resolveCanvasArtboardSize(screen.widgets, screen.canvas);
  const presetSize = resolveCanvasPresetSize(screen.canvas);
  const isEmpty = screen.widgets.length === 0;

  return (
    <div className="builder-canvas-viewport">
      <div
        className="builder-canvas-artboard"
        data-builder-empty={isEmpty ? "true" : undefined}
        style={{
          width: `${artboardSize.width}px`,
          height: `${artboardSize.height}px`,
        }}
      >
        <div
          aria-hidden
          className="builder-canvas-target-zone"
          style={{
            width: `${presetSize.width}px`,
            height: `${presetSize.height}px`,
          }}
        >
          <span>{screen.canvas.preset_id}</span>
        </div>

        {isEmpty ? <BuilderComingSoonMessage screen={screen} /> : null}

        {descriptors.map((descriptor) => (
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
            {renderWidgetDescriptor(descriptor)}
          </BuilderCanvasItem>
        ))}
      </div>
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
