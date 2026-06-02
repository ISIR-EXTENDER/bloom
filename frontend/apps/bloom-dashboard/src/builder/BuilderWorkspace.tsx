import type { ScreenConfig, WidgetLayout } from "@bloom/api-client";
import { updateWidgetLayout } from "@bloom/widgets";
import { useEffect, useState } from "react";
import type { LoadedConfiguration } from "../configurations/configuration-loader";
import {
  ConfigurationWorkspace,
  resolveSelectedWorkspace,
  type WorkspaceSelection,
} from "../ui/ConfigurationWorkspace";
import { BuilderCanvas } from "./BuilderCanvas";
import { BuilderInspector } from "./BuilderInspector";
import { useSelectedBuilderWidget } from "./useSelectedBuilderWidget";

type BuilderWorkspaceProps = {
  configurations: readonly LoadedConfiguration[];
  onSelectionChange: (selection: WorkspaceSelection) => void;
  selection: WorkspaceSelection;
};

export function BuilderWorkspace({ configurations, onSelectionChange, selection }: BuilderWorkspaceProps) {
  const selectedWorkspace = resolveSelectedWorkspace(configurations, selection);
  const [draftScreen, setDraftScreen] = useState<ScreenConfig>(selectedWorkspace.screen);
  const { selectedWidget, selectedWidgetId, setSelectedWidgetId } = useSelectedBuilderWidget(draftScreen);

  useEffect(() => {
    setDraftScreen(selectedWorkspace.screen);
  }, [selectedWorkspace.screen]);

  const handleMoveWidget = (widgetId: string, layout: WidgetLayout) => {
    setDraftScreen((currentScreen) => updateWidgetLayout(currentScreen, widgetId, layout));
  };

  return (
    <section className="builder-workspace" aria-label="Bloom builder workspace">
      <ConfigurationWorkspace
        configurations={configurations}
        onSelectionChange={onSelectionChange}
        selection={selection}
      />

      <section className="builder-stage-panel" aria-labelledby="builder-stage-title">
        <header className="builder-stage-toolbar">
          <div>
            <p className="eyebrow">Builder canvas</p>
            <h2 id="builder-stage-title">{draftScreen.title}</h2>
          </div>
          <dl className="builder-stage-meta">
            <div>
              <dt>Canvas</dt>
              <dd>{draftScreen.canvas.preset_id}</dd>
            </div>
            <div>
              <dt>Widgets</dt>
              <dd>{draftScreen.widgets.length}</dd>
            </div>
            <div>
              <dt>Mode</dt>
              <dd>Preview</dd>
            </div>
          </dl>
        </header>

        <BuilderCanvas
          onMoveWidget={handleMoveWidget}
          onSelectWidget={setSelectedWidgetId}
          screen={draftScreen}
          selectedWidgetId={selectedWidgetId}
        />
      </section>

      <BuilderInspector selectedWidget={selectedWidget} widgetCount={draftScreen.widgets.length} />
    </section>
  );
}
