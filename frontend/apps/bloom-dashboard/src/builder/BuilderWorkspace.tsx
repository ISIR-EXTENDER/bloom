import type { LoadedConfiguration } from "../configurations/configuration-loader";
import {
  ConfigurationWorkspace,
  resolveSelectedWorkspace,
  type WorkspaceSelection,
} from "../ui/ConfigurationWorkspace";
import { BuilderCanvas } from "./BuilderCanvas";
import { BuilderInspector } from "./BuilderInspector";
import { useBuilderScreenDraft } from "./useBuilderScreenDraft";
import { useSelectedBuilderWidget } from "./useSelectedBuilderWidget";

type BuilderWorkspaceProps = {
  configurations: readonly LoadedConfiguration[];
  onSelectionChange: (selection: WorkspaceSelection) => void;
  selection: WorkspaceSelection;
};

export function BuilderWorkspace({ configurations, onSelectionChange, selection }: BuilderWorkspaceProps) {
  const selectedWorkspace = resolveSelectedWorkspace(configurations, selection);
  const { canRedo, canUndo, commitWidgetLayout, draftScreen, previewWidgetLayout, redo, undo } = useBuilderScreenDraft(
    selectedWorkspace.screen,
  );
  const { selectedWidget, selectedWidgetId, setSelectedWidgetId } = useSelectedBuilderWidget(draftScreen);

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
          <div className="builder-stage-actions">
            <button disabled={!canUndo} onClick={undo} type="button">
              Undo
            </button>
            <button disabled={!canRedo} onClick={redo} type="button">
              Redo
            </button>
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
          onCommitWidgetLayout={commitWidgetLayout}
          onPreviewWidgetLayout={previewWidgetLayout}
          onSelectWidget={setSelectedWidgetId}
          screen={draftScreen}
          selectedWidgetId={selectedWidgetId}
        />
      </section>

      <BuilderInspector selectedWidget={selectedWidget} widgetCount={draftScreen.widgets.length} />
    </section>
  );
}
