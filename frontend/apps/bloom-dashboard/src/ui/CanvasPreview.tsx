import type { ScreenConfig } from "@bloom/api-client";
import { renderScreenWidgets, type WidgetActionIntentHandler } from "@bloom/widget-renderers";
import { createDefaultWidgetRegistry, renderScreenDescriptors, resolveCanvasArtboardSize } from "@bloom/widgets";

const widgetRegistry = createDefaultWidgetRegistry();

type CanvasPreviewProps = {
  mode: "builder" | "runtime";
  onActionIntent?: WidgetActionIntentHandler;
  screen: ScreenConfig;
};

export function CanvasPreview({ mode, onActionIntent, screen }: CanvasPreviewProps) {
  const descriptors = renderScreenDescriptors(screen, widgetRegistry);
  const artboardSize = resolveCanvasArtboardSize(screen.widgets, screen.canvas);

  return (
    <section className="canvas-panel" aria-labelledby="canvas-preview-title">
      <div className="canvas-heading">
        <div>
          <p className="eyebrow">{mode === "builder" ? "Builder preview" : "Runtime preview"}</p>
          <h2 id="canvas-preview-title">{screen.title}</h2>
        </div>
        <small>
          {screen.canvas.preset_id} · {screen.widgets.length} widgets
        </small>
      </div>
      <div className="canvas-viewport">
        <div
          className="screen-preview-artboard"
          data-canvas-mode={mode}
          style={{
            aspectRatio: `${artboardSize.width} / ${artboardSize.height}`,
            minWidth: `${Math.min(960, artboardSize.width)}px`,
          }}
        >
          {renderScreenWidgets(descriptors, { onActionIntent })}
        </div>
      </div>
    </section>
  );
}
