import type { CanvasSettings } from "@bloom/api-client";
import { resolveCanvasFitScale, type ViewportSize } from "@bloom/widgets";

const FIT_OVERFLOW_GUARD = 0.99;

export type RuntimeFitWarning = {
  authoredHeight: number;
  authoredWidth: number;
  shownPercent: number;
};

export type RuntimeCanvasFit = {
  scale: number;
  warning: RuntimeFitWarning | null;
};

export function resolveRuntimeCanvasFit(
  canvas: CanvasSettings,
  authoredSize: ViewportSize,
  viewportSize: ViewportSize,
): RuntimeCanvasFit {
  const fitScale = resolveCanvasFitScale(canvas, authoredSize, viewportSize);
  const scale = canvas.runtime_mode === "fit" ? fitScale * FIT_OVERFLOW_GUARD : fitScale;

  return {
    scale,
    warning:
      fitScale < 1
        ? {
            authoredHeight: authoredSize.height,
            authoredWidth: authoredSize.width,
            shownPercent: Math.round(scale * 100),
          }
        : null,
  };
}
