import type { WidgetConfig, WidgetLayout } from "@bloom/api-client";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode, PointerEvent as ReactPointerEvent } from "react";
import { glassPx } from "./builder-geometry";
import {
  type BuilderCanvasSize,
  type BuilderWidgetMinSize,
  moveWidgetLayout,
  resizeWidgetLayout,
  resolveElementScale,
} from "./builderLayout";

type BuilderCanvasItemProps = {
  canvasSize: BuilderCanvasSize;
  children: ReactNode;
  /** Draw the size chip inside the frame, where hanging it above would cover the widget up there. */
  chipInside?: boolean;
  /** Scale this canvas reaches the glass at on the class's smallest panel. */
  glassScale?: number;
  onCommitWidgetLayout: (widgetId: string, startingLayout: WidgetLayout, finalLayout: WidgetLayout) => void;
  onPreviewWidgetLayout: (widgetId: string, layout: WidgetLayout) => void;
  onSelectWidget: (widgetId: string) => void;
  selected: boolean;
  minSize: BuilderWidgetMinSize;
  tooSmall?: boolean;
  widget: WidgetConfig;
};

export function BuilderCanvasItem({
  canvasSize,
  children,
  chipInside = false,
  glassScale = 1,
  minSize,
  onCommitWidgetLayout,
  onPreviewWidgetLayout,
  onSelectWidget,
  selected,
  tooSmall = false,
  widget,
}: BuilderCanvasItemProps) {
  const startInteraction = (event: ReactPointerEvent<HTMLButtonElement>, mode: "move" | "resize") => {
    if (event.button && event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onSelectWidget(widget.id);

    const startPointerX = event.clientX;
    const startPointerY = event.clientY;
    const startLayout = widget.layout;
    let finalLayout = startLayout;
    const pointerScale = resolveElementScale(event.currentTarget);
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    document.body.style.cursor = mode === "move" ? "grabbing" : "nwse-resize";
    document.body.style.userSelect = "none";

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const dx = Math.round((moveEvent.clientX - startPointerX) / pointerScale);
      const dy = Math.round((moveEvent.clientY - startPointerY) / pointerScale);
      const nextLayout =
        mode === "move"
          ? moveWidgetLayout(startLayout, { dx, dy }, canvasSize)
          : resizeWidgetLayout(startLayout, { dx, dy }, canvasSize, minSize);

      finalLayout = nextLayout;
      onPreviewWidgetLayout(widget.id, nextLayout);
    };

    const cleanup = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };

    const handlePointerUp = () => {
      cleanup();
      if (finalLayout !== startLayout) {
        onCommitWidgetLayout(widget.id, startLayout, finalLayout);
      }
    };

    // The browser claiming the gesture -- a scroll on the tablet this is authored on -- ends the drag
    // without a pointerup. Left listening, the widget kept following a pointer nobody was holding.
    const handlePointerCancel = () => {
      cleanup();
      if (finalLayout !== startLayout) {
        onPreviewWidgetLayout(widget.id, startLayout);
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
  };

  // The canvas is otherwise pointer-only: arrows nudge, shift takes the coarse step.
  const nudge = (event: ReactKeyboardEvent<HTMLButtonElement>, mode: "move" | "resize") => {
    const step = event.shiftKey ? 16 : 2;
    const delta = { dx: 0, dy: 0 };
    if (event.key === "ArrowLeft") delta.dx = -step;
    else if (event.key === "ArrowRight") delta.dx = step;
    else if (event.key === "ArrowUp") delta.dy = -step;
    else if (event.key === "ArrowDown") delta.dy = step;
    else return;

    event.preventDefault();
    const next =
      mode === "move"
        ? moveWidgetLayout(widget.layout, delta, canvasSize)
        : resizeWidgetLayout(widget.layout, delta, canvasSize, minSize);
    onSelectWidget(widget.id);
    onCommitWidgetLayout(widget.id, widget.layout, next);
  };

  return (
    <article
      aria-label={`${widget.title} ${widget.kind} widget`}
      className={`builder-widget-frame widget-preview-card ${selected ? "is-selected" : ""}`}
      data-too-small={tooSmall ? "true" : undefined}
      data-widget-kind={widget.kind}
      style={{
        left: `${widget.layout.x}px`,
        top: `${widget.layout.y}px`,
        width: `${widget.layout.width}px`,
        height: `${widget.layout.height}px`,
      }}
    >
      <button
        aria-label={`Select and move ${widget.title} widget`}
        aria-pressed={selected}
        className="builder-widget-selector"
        onClick={() => onSelectWidget(widget.id)}
        onKeyDown={(event) => nudge(event, "move")}
        onPointerDown={(event) => startInteraction(event, "move")}
        type="button"
      />
      {children}
      <span className="builder-widget-frame-badge">{widget.kind}</span>
      {tooSmall ? <span className="builder-widget-too-small">Too small</span> : null}
      {selected ? (
        <span className="builder-widget-size-chip" data-inside={chipInside ? "true" : undefined}>
          {widget.layout.width}×{widget.layout.height} · {glassPx(widget, glassScale)} px glass
        </span>
      ) : null}
      <button
        aria-label={`Resize ${widget.title} widget`}
        className="builder-widget-resize-handle"
        onKeyDown={(event) => nudge(event, "resize")}
        onPointerDown={(event) => startInteraction(event, "resize")}
        type="button"
      />
    </article>
  );
}
