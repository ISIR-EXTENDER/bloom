import type { WidgetLayout } from "@bloom/api-client";
import { WIDGET_LAYOUT_GRID_SIZE } from "@bloom/widgets";

export type BuilderCanvasSize = {
  height: number;
  width: number;
};

export type BuilderPointerDelta = {
  dx: number;
  dy: number;
};

export type BuilderWidgetMinSize = {
  height: number;
  width: number;
};

export function moveWidgetLayout(
  layout: WidgetLayout,
  delta: BuilderPointerDelta,
  canvasSize: BuilderCanvasSize,
): WidgetLayout {
  return {
    ...layout,
    x: clampLayoutValue(snapLayoutValue(layout.x + delta.dx), 0, Math.max(0, canvasSize.width - layout.width)),
    y: clampLayoutValue(snapLayoutValue(layout.y + delta.dy), 0, Math.max(0, canvasSize.height - layout.height)),
  };
}

export function resizeWidgetLayout(
  layout: WidgetLayout,
  delta: BuilderPointerDelta,
  canvasSize: BuilderCanvasSize,
  minSize: BuilderWidgetMinSize,
): WidgetLayout {
  const maxWidth = Math.max(minSize.width, canvasSize.width - layout.x);
  const maxHeight = Math.max(minSize.height, canvasSize.height - layout.y);

  return {
    ...layout,
    width: clampLayoutValue(snapLayoutValue(layout.width + delta.dx), minSize.width, maxWidth),
    height: clampLayoutValue(snapLayoutValue(layout.height + delta.dy), minSize.height, maxHeight),
  };
}

export function parseScaleFromTransform(transform: string): number {
  if (!transform || transform === "none") {
    return 1;
  }

  if (transform.startsWith("matrix3d(") && transform.endsWith(")")) {
    const values = parseTransformValues(transform, "matrix3d(");
    const scaleX = values[0];
    return Number.isFinite(scaleX) && scaleX !== 0 ? Math.abs(scaleX) : 1;
  }

  if (transform.startsWith("matrix(") && transform.endsWith(")")) {
    const values = parseTransformValues(transform, "matrix(");
    const scaleX = values[0];
    const skewY = values[1];
    if (Number.isFinite(scaleX) && Number.isFinite(skewY)) {
      const scale = Math.hypot(scaleX, skewY);
      return scale > 0 ? scale : 1;
    }
  }

  return 1;
}

export function resolveElementScale(startNode: HTMLElement): number {
  let node: HTMLElement | null = startNode;
  let scale = 1;

  while (node) {
    scale *= parseScaleFromTransform(window.getComputedStyle(node).transform);
    node = node.parentElement;
  }

  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

function snapLayoutValue(value: number): number {
  return Math.round(value / WIDGET_LAYOUT_GRID_SIZE) * WIDGET_LAYOUT_GRID_SIZE;
}

function clampLayoutValue(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function parseTransformValues(transform: string, prefix: string): number[] {
  return transform
    .slice(prefix.length, -1)
    .split(",")
    .map((value) => Number(value.trim()));
}
