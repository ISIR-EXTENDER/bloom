import type { ScreenConfig, WidgetConfig, WidgetLayout } from "@bloom/api-client";
import { findSizeShortfall, minSizeFor, type WidgetRenderDescriptor } from "@bloom/widgets";
import { type ReactNode, type PointerEvent as ReactPointerEvent, useState } from "react";
import { ScreenArtboard, type ScreenArtboardLayout } from "../screen/ScreenArtboard";
import { BuilderCanvasItem } from "./BuilderCanvasItem";
import { explainLayoutRefusal, KIOSK_BAR_HEIGHT, overlapsRegion, resolveBuilderPanel } from "./builder-geometry";
import { resolveElementScale } from "./builderLayout";

type BuilderCanvasProps = {
  /** Moves the box STOP is drawn in. It can be placed, never removed. */
  onMoveReservedRegion?: (regionId: string, next: { x: number; y: number }) => void;
  onCommitWidgetLayout: (widgetId: string, startingLayout: WidgetLayout, finalLayout: WidgetLayout) => void;
  onPreviewWidgetLayout: (widgetId: string, layout: WidgetLayout) => void;
  onSelectWidget: (widgetId: string) => void;
  screen: ScreenConfig;
  selectedWidgetId: string | null;
};

export function BuilderCanvas({
  onMoveReservedRegion,
  onCommitWidgetLayout,
  onPreviewWidgetLayout,
  onSelectWidget,
  screen,
  selectedWidgetId,
}: BuilderCanvasProps) {
  const { artboard: artboardSize, glassScale } = resolveBuilderPanel(screen);
  const regions = screen.reserved_regions ?? [];
  // Where STOP is while it is being dragged; saved once on release, so one drag is one undo step.
  const [dragging, setDragging] = useState<{ id: string; x: number; y: number } | null>(null);

  const startRegionDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    region: { id: string; x: number; y: number; width: number; height: number },
  ) => {
    if (event.button && event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const scale = resolveElementScale(event.currentTarget);
    const start = { x: event.clientX, y: event.clientY };
    const clamp = (dx: number, dy: number) => ({
      id: region.id,
      x: Math.max(0, Math.min(artboardSize.width - region.width, Math.round(region.x + dx / scale))),
      y: Math.max(0, Math.min(artboardSize.height - region.height, Math.round(region.y + dy / scale))),
    });
    let last = clamp(0, 0);
    const previousCursor = document.body.style.cursor;
    document.body.style.cursor = "grabbing";
    const move = (moveEvent: PointerEvent) => {
      last = clamp(moveEvent.clientX - start.x, moveEvent.clientY - start.y);
      setDragging(last);
    };
    const finish = (commit: boolean) => () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", cancel);
      document.body.style.cursor = previousCursor;
      setDragging(null);
      if (commit && (last.x !== region.x || last.y !== region.y)) {
        onMoveReservedRegion?.(region.id, { x: last.x, y: last.y });
      }
    };
    const release = finish(true);
    const cancel = finish(false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", cancel);
  };

  const renderEditableWidgetFrame = (descriptor: WidgetRenderDescriptor, content: ReactNode) => (
    <BuilderCanvasItem
      canvasSize={artboardSize}
      chipInside={chipWouldCoverANeighbour(descriptor.widget, screen)}
      glassScale={glassScale}
      key={descriptor.widget.id}
      minSize={resolveWidgetMinSize(descriptor)}
      onCommitWidgetLayout={(widgetId, start, final) =>
        // The same question the inspector asks. Refusing only a reserved region let a resize handle
        // push a widget past the artboard edge, which the inspector then refused for the very same
        // layout -- and the backend has no upper bound, so a save persisted it.
        onCommitWidgetLayout(widgetId, start, explainLayoutRefusal(final, screen) ? start : final)
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
              {regions.map((region) => {
                const movable = region.id === "stop" && onMoveReservedRegion !== undefined;
                const nudge = (dx: number, dy: number) =>
                  onMoveReservedRegion?.(region.id, {
                    x: Math.max(0, Math.min(artboardSize.width - region.width, region.x + dx)),
                    y: Math.max(0, Math.min(artboardSize.height - region.height, region.y + dy)),
                  });
                const at = dragging?.id === region.id ? dragging : region;
                const box = {
                  height: `${region.height}px`,
                  left: `${at.x}px`,
                  top: `${at.y}px`,
                  width: `${region.width}px`,
                };
                // The runtime draws STOP; an author places the box it goes in, and cannot remove it.
                const label =
                  region.id === "stop" ? "STOP · drawn by the runtime, placed here" : `Reserved ${region.id}`;

                if (!movable) {
                  return (
                    <div className="builder-canvas-region" key={region.id} role="note" style={box}>
                      {label}
                    </div>
                  );
                }

                return (
                  <button
                    aria-label="Move the STOP region"
                    className="builder-canvas-region"
                    data-movable="true"
                    key={region.id}
                    data-dragging={dragging?.id === region.id ? "true" : undefined}
                    onPointerDown={(event) => startRegionDrag(event, region)}
                    onKeyDown={(event) => {
                      const step = event.shiftKey ? 16 : 2;
                      if (event.key === "ArrowLeft") nudge(-step, 0);
                      else if (event.key === "ArrowRight") nudge(step, 0);
                      else if (event.key === "ArrowUp") nudge(0, -step);
                      else if (event.key === "ArrowDown") nudge(0, step);
                      else return;
                      event.preventDefault();
                    }}
                    style={box}
                    type="button"
                  >
                    {label}
                  </button>
                );
              })}
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

/**
 * What the resize handle may shrink a widget to.
 *
 * The contract table is the answer wherever it has one, because the handle used to read a second
 * set of numbers on the widget definition and the two disagreed for eight kinds: a joystick could
 * be dragged to 160x160 and the inspector would then say it needs 280x332. Robin met that at the
 * bench and read it as the minimums being absurd, which they were, from the outside.
 *
 * It also depends on settings, which a fixed pair on the definition cannot express: a vertical
 * slider and a horizontal one want opposite shapes.
 */
function resolveWidgetMinSize(descriptor: WidgetRenderDescriptor) {
  if (descriptor.status !== "resolved") {
    return { width: 40, height: 40 };
  }

  const contract = minSizeFor(descriptor.widget.kind, descriptor.widget.settings);
  if (contract) {
    return { width: contract[0], height: contract[1] };
  }

  return {
    width: descriptor.definition.defaultLayout.minWidth,
    height: descriptor.definition.defaultLayout.minHeight,
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
