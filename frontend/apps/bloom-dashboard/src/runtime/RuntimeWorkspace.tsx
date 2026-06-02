import type { ApplicationConfig, ScreenConfig } from "@bloom/api-client";
import { renderScreenWidgets, type WidgetActionIntentHandler } from "@bloom/widget-renderers";
import { createDefaultWidgetRegistry, renderScreenDescriptors, resolveCanvasArtboardSize } from "@bloom/widgets";

import type { WorkspaceSelection } from "../ui/ConfigurationWorkspace";

const widgetRegistry = createDefaultWidgetRegistry();

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
  const descriptors = renderScreenDescriptors(screen, widgetRegistry);
  const artboardSize = resolveCanvasArtboardSize(screen.widgets, screen.canvas);

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
        <div className="runtime-app-canvas-viewport" data-runtime-mode={screen.canvas.runtime_mode}>
          <div
            className="runtime-app-artboard"
            style={{
              width: `${artboardSize.width}px`,
              height: `${artboardSize.height}px`,
            }}
          >
            {screen.widgets.length === 0 ? (
              <RuntimeComingSoonMessage screen={screen} />
            ) : (
              renderScreenWidgets(descriptors, { onActionIntent })
            )}
          </div>
        </div>
      </div>
    </section>
  );
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
