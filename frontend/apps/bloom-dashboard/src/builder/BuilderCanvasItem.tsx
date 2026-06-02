import type { WidgetConfig, WidgetLayout } from "@bloom/api-client";
import type { ReactNode, PointerEvent as ReactPointerEvent } from "react";
import { type BuilderCanvasSize, moveWidgetLayout, resolveElementScale } from "./builderLayout";

type BuilderCanvasItemProps = {
  canvasSize: BuilderCanvasSize;
  children: ReactNode;
  onMoveWidget: (widgetId: string, layout: WidgetLayout) => void;
  onSelectWidget: (widgetId: string) => void;
  selected: boolean;
  widget: WidgetConfig;
};

export function BuilderCanvasItem({
  canvasSize,
  children,
  onMoveWidget,
  onSelectWidget,
  selected,
  widget,
}: BuilderCanvasItemProps) {
  const startMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button && event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onSelectWidget(widget.id);

    const startPointerX = event.clientX;
    const startPointerY = event.clientY;
    const startLayout = widget.layout;
    const pointerScale = resolveElementScale(event.currentTarget);
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const dx = Math.round((moveEvent.clientX - startPointerX) / pointerScale);
      const dy = Math.round((moveEvent.clientY - startPointerY) / pointerScale);
      onMoveWidget(widget.id, moveWidgetLayout(startLayout, { dx, dy }, canvasSize));
    };

    const cleanup = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };

    const handlePointerUp = () => {
      cleanup();
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  return (
    <div
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
        onPointerDown={startMove}
        type="button"
      />
      {children}
      <span className="builder-widget-frame-badge">{widget.kind}</span>
    </div>
  );
}
