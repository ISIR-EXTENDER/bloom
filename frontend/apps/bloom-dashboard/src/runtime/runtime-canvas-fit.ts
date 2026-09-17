import type { CanvasSettings, ScreenConfig } from "@bloom/api-client";
import {
  resolveCanvasArtboardSize,
  resolveCanvasFitScale,
  resolveCanvasPresetSize,
  type ViewportSize,
} from "@bloom/widgets";

const FIT_OVERFLOW_GUARD = 0.99;
export const KIOSK_BAR_HEIGHT = 44;

export type RuntimeFitWarning = {
  authoredHeight: number;
  authoredWidth: number;
  shownPercent: number;
};

export type RuntimeCanvasFit = {
  scale: number;
  warning: RuntimeFitWarning | null;
};

/**
 * A screen that reserves regions is drawn for the whole panel: its canvas is the body under the 44 px bar, so
 * 1280×720 shows at 1.0 (drive.md). Other screens keep the artboard around their widgets.
 */
export function isFullPanelScreen(screen: Pick<ScreenConfig, "reserved_regions">): boolean {
  return (screen.reserved_regions?.length ?? 0) > 0;
}

export function resolveRuntimeArtboardSize(screen: ScreenConfig): ViewportSize {
  if (!isFullPanelScreen(screen)) {
    return resolveCanvasArtboardSize(screen.widgets, screen.canvas);
  }
  const preset = resolveCanvasPresetSize(screen.canvas);
  return { width: preset.width, height: preset.height - KIOSK_BAR_HEIGHT };
}

export function resolveRuntimeCanvasFit(
  canvas: CanvasSettings,
  authoredSize: ViewportSize,
  viewportSize: ViewportSize,
  fullPanel = false,
): RuntimeCanvasFit {
  const fitScale = resolveCanvasFitScale(canvas, authoredSize, viewportSize);
  // A full-panel canvas has no shell padding to absorb rounding, and its sizes are floored instead.
  const scale = canvas.runtime_mode === "fit" && !fullPanel ? fitScale * FIT_OVERFLOW_GUARD : fitScale;

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
