import type { WidgetConfig, WidgetLayout } from "@bloom/api-client";
import type { ReactNode, PointerEvent as ReactPointerEvent } from "react";
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
  onCommitWidgetLayout: (widgetId: string, startingLayout: WidgetLayout, finalLayout: WidgetLayout) => void;
  onPreviewWidgetLayout: (widgetId: string, layout: WidgetLayout) => void;
  onSelectWidget: (widgetId: string) => void;
  selected: boolean;
  minSize: BuilderWidgetMinSize;
  widget: WidgetConfig;
};

export function BuilderCanvasItem({
  canvasSize,
  children,
  minSize,
  onCommitWidgetLayout,
  onPreviewWidgetLayout,
  onSelectWidget,
  selected,
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
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };

    const handlePointerUp = () => {
      cleanup();
      if (finalLayout !== startLayout) {
        onCommitWidgetLayout(widget.id, startLayout, finalLayout);
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  return (
    <article
      aria-label={`${widget.title} ${widget.kind} widget`}
      className={`builder-widget-frame widget-preview-card ${selected ? "is-selected" : ""}`}
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
        onPointerDown={(event) => startInteraction(event, "move")}
        type="button"
      />
      {children}
      <span className="builder-widget-frame-badge">{widget.kind}</span>
      <button
        aria-label={`Resize ${widget.title} widget`}
        className="builder-widget-resize-handle"
        onPointerDown={(event) => startInteraction(event, "resize")}
        type="button"
      />
    </article>
  );
}
