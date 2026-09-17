import type { ScreenConfig, WidgetConfig, WidgetLayout } from "@bloom/api-client";
import { findSizeShortfall, type WidgetRenderDescriptor } from "@bloom/widgets";
import type { ReactNode } from "react";
import { ScreenArtboard, type ScreenArtboardLayout } from "../screen/ScreenArtboard";
import { BuilderCanvasItem } from "./BuilderCanvasItem";
import { KIOSK_BAR_HEIGHT, overlapsRegion, refuseReservedRegion, resolveBuilderPanel } from "./builder-geometry";

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
  const { artboard: artboardSize, glassScale } = resolveBuilderPanel(screen);
  const regions = screen.reserved_regions ?? [];

  const renderEditableWidgetFrame = (descriptor: WidgetRenderDescriptor, content: ReactNode) => (
    <BuilderCanvasItem
      canvasSize={artboardSize}
      chipInside={chipWouldCoverANeighbour(descriptor.widget, screen)}
      glassScale={glassScale}
      key={descriptor.widget.id}
      minSize={resolveWidgetMinSize(descriptor)}
      onCommitWidgetLayout={(widgetId, start, final) =>
        onCommitWidgetLayout(widgetId, start, refuseReservedRegion(final, start, regions))
      }
      onPreviewWidgetLayout={(widgetId, layout) => {
        if (!overlapsRegion(layout, regions)) {
          onPreviewWidgetLayout(widgetId, layout);
        }
      }}
      tooSmall={findSizeShortfall(descriptor.widget) !== null}
      onSelectWidget={onSelectWidget}
      selected={descriptor.widget.id === selectedWidgetId}
      widget={descriptor.widget}
    >
      {content}
    </BuilderCanvasItem>
  );

  return (
    <div className="builder-canvas-viewport">
      <div className="builder-canvas-panel" style={{ width: `${artboardSize.width}px` }}>
        <div aria-hidden="true" className="builder-canvas-bar" style={{ height: `${KIOSK_BAR_HEIGHT}px` }}>
          kiosk bar · {KIOSK_BAR_HEIGHT} px · chrome
        </div>
        <ScreenArtboard
          className="builder-canvas-artboard"
          renderBackground={(layout, renderedScreen) => (
            <>
              {regions.length === 0 ? <BuilderPresetTarget layout={layout} screen={renderedScreen} /> : null}
              {regions.map((region) => (
                <div
                  className="builder-canvas-region"
                  key={region.id}
                  role="note"
                  style={{
                    height: `${region.height}px`,
                    left: `${region.x}px`,
                    top: `${region.y}px`,
                    width: `${region.width}px`,
                  }}
                >
                  Reserved {region.id === "stop" ? "STOP" : region.id}
                </div>
              ))}
            </>
          )}
          renderEmptyState={(emptyScreen) => <BuilderEmptyScreenMessage screen={emptyScreen} />}
          renderWidgetFrame={renderEditableWidgetFrame}
          screen={screen}
          style={{ height: `${artboardSize.height}px`, width: `${artboardSize.width}px` }}
        />
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

function BuilderEmptyScreenMessage({ screen }: { screen: ScreenConfig }) {
  return (
    <section className="builder-coming-soon" aria-label="Empty screen">
      <p className="eyebrow">Empty screen</p>
      <h3>{screen.title} has no widgets yet.</h3>
      <p>Add one from the widget palette. It lands clear of any region the runtime reserves.</p>
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

const CHIP_STRIP = 26;

/** The size chip hangs above the selection; over a widget up there it would hide that widget's own title. */
function chipWouldCoverANeighbour(widget: WidgetConfig, screen: ScreenConfig): boolean {
  const { layout } = widget;
  if (layout.y < CHIP_STRIP) {
    return true;
  }
  return screen.widgets.some(
    (other) =>
      other.id !== widget.id &&
      other.layout.x < layout.x + 240 &&
      other.layout.x + other.layout.width > layout.x &&
      other.layout.y + other.layout.height > layout.y - CHIP_STRIP &&
      other.layout.y < layout.y,
  );
}
