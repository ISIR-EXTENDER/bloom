import type { ApplicationConfig, ScreenConfig } from "@bloom/api-client";
import type { WidgetActionIntentHandler } from "@bloom/widget-renderers";
import { resolveCanvasFitScale } from "@bloom/widgets";
import { useEffect, useMemo, useRef, useState } from "react";

import { resolveScreenArtboardLayout, ScreenArtboard } from "../screen/ScreenArtboard";
import type { WorkspaceSelection } from "../ui/ConfigurationWorkspace";

const FIT_OVERFLOW_GUARD = 0.99;

type RuntimeViewportSize = {
  height: number;
  width: number;
};

type RuntimeWorkspaceProps = {
  application: ApplicationConfig;
  onActionIntent: WidgetActionIntentHandler;
  onSelectionChange: (selection: WorkspaceSelection) => void;
  screen: ScreenConfig;
  selection: WorkspaceSelection;
};

export function RuntimeWorkspace({
  application,
  onActionIntent,
  onSelectionChange,
  screen,
  selection,
}: RuntimeWorkspaceProps) {
  const canvasViewportRef = useRef<HTMLDivElement | null>(null);
  const [viewportSize, setViewportSize] = useState<RuntimeViewportSize>(() => getWindowViewportSize());
  const { artboardSize } = resolveScreenArtboardLayout(screen);
  const artboardScale = useMemo(() => {
    const rawScale = resolveCanvasFitScale(screen.canvas, artboardSize, viewportSize);

    return screen.canvas.runtime_mode === "fit" ? rawScale * FIT_OVERFLOW_GUARD : rawScale;
  }, [artboardSize, screen.canvas, viewportSize]);
  const scaledArtboardSize = useMemo(
    () => ({
      height: Math.max(1, Math.floor(artboardSize.height * artboardScale)),
      width: Math.max(1, Math.floor(artboardSize.width * artboardScale)),
    }),
    [artboardScale, artboardSize],
  );

  useEffect(() => {
    const viewport = canvasViewportRef.current;
    if (!viewport) {
      return;
    }

    const updateViewportSize = () => {
      setViewportSize(measureViewportSize(viewport));
    };

    updateViewportSize();

    const resizeObserver = new ResizeObserver(updateViewportSize);
    resizeObserver.observe(viewport);
    window.addEventListener("resize", updateViewportSize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateViewportSize);
    };
  }, []);

  return (
    <section className="runtime-app-workspace" aria-label="Runtime application">
      <header className="runtime-app-topbar">
        <div>
          <p className="eyebrow">Runtime app</p>
          <h2>{application.name}</h2>
        </div>

        {application.screens.length > 1 ? (
          <nav className="runtime-screen-tabs" aria-label="Runtime screens">
            {application.screens.map((availableScreen) => (
              <button
                aria-current={screen.id === availableScreen.id ? "page" : undefined}
                className="runtime-screen-tab"
                key={availableScreen.id}
                onClick={() =>
                  onSelectionChange({
                    ...selection,
                    screenId: availableScreen.id,
                  })
                }
                type="button"
              >
                <strong>{availableScreen.title}</strong>
                <span>{availableScreen.widgets.length} widgets</span>
              </button>
            ))}
          </nav>
        ) : null}
      </header>

      <div className="runtime-app-canvas-shell">
        <div
          className="runtime-app-canvas-viewport"
          data-runtime-mode={screen.canvas.runtime_mode}
          ref={canvasViewportRef}
        >
          <div
            className="runtime-app-artboard-frame"
            style={{
              height: `${scaledArtboardSize.height}px`,
              width: `${scaledArtboardSize.width}px`,
            }}
          >
            <ScreenArtboard
              className="runtime-app-artboard"
              renderEmptyState={(emptyScreen) => <RuntimeComingSoonMessage screen={emptyScreen} />}
              rendererOptions={{ onActionIntent }}
              screen={screen}
              style={{ transform: `scale(${artboardScale})` }}
              testId="runtime-artboard"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function measureViewportSize(viewport: HTMLDivElement): RuntimeViewportSize {
  const style = window.getComputedStyle(viewport);
  const horizontalPadding = readCssPixelValue(style.paddingLeft) + readCssPixelValue(style.paddingRight);
  const verticalPadding = readCssPixelValue(style.paddingTop) + readCssPixelValue(style.paddingBottom);
  const windowSize = getWindowViewportSize();

  return {
    height: Math.max(1, (viewport.clientHeight || windowSize.height) - verticalPadding),
    width: Math.max(1, (viewport.clientWidth || windowSize.width) - horizontalPadding),
  };
}

function getWindowViewportSize(): RuntimeViewportSize {
  if (typeof window === "undefined") {
    return { height: 1, width: 1 };
  }

  return {
    height: Math.max(1, window.innerHeight),
    width: Math.max(1, window.innerWidth),
  };
}

function readCssPixelValue(value: string): number {
  const parsedValue = Number.parseFloat(value);

  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function RuntimeComingSoonMessage({ screen }: { screen: ScreenConfig }) {
  return (
    <section className="runtime-coming-soon" aria-label="Runtime screen coming soon">
      <p className="eyebrow">Coming soon</p>
      <h3>{screen.title}</h3>
      <p>This screen exists in the application model, but it does not have runtime content yet.</p>
    </section>
  );
}
