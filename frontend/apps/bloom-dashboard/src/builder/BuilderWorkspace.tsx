import type { WidgetConfig } from "@bloom/api-client";
import { useEffect, useState } from "react";
import type { LoadedConfiguration } from "../configurations/configuration-loader";
import {
  ConfigurationWorkspace,
  resolveSelectedWorkspace,
  type WorkspaceSelection,
} from "../ui/ConfigurationWorkspace";
import { BuilderCanvas } from "./BuilderCanvas";

type BuilderWorkspaceProps = {
  configurations: readonly LoadedConfiguration[];
  onSelectionChange: (selection: WorkspaceSelection) => void;
  selection: WorkspaceSelection;
};

export function BuilderWorkspace({ configurations, onSelectionChange, selection }: BuilderWorkspaceProps) {
  const selectedWorkspace = resolveSelectedWorkspace(configurations, selection);
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(
    selectedWorkspace.screen.widgets[0]?.id ?? null,
  );

  useEffect(() => {
    setSelectedWidgetId((currentWidgetId) => {
      if (currentWidgetId && selectedWorkspace.screen.widgets.some((widget) => widget.id === currentWidgetId)) {
        return currentWidgetId;
      }
      return selectedWorkspace.screen.widgets[0]?.id ?? null;
    });
  }, [selectedWorkspace.screen]);

  const selectedWidget =
    selectedWorkspace.screen.widgets.find((widget) => widget.id === selectedWidgetId) ??
    selectedWorkspace.screen.widgets[0] ??
    null;

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
            <h2 id="builder-stage-title">{selectedWorkspace.screen.title}</h2>
          </div>
          <dl className="builder-stage-meta">
            <div>
              <dt>Canvas</dt>
              <dd>{selectedWorkspace.screen.canvas.preset_id}</dd>
            </div>
            <div>
              <dt>Widgets</dt>
              <dd>{selectedWorkspace.screen.widgets.length}</dd>
            </div>
            <div>
              <dt>Mode</dt>
              <dd>Preview</dd>
            </div>
          </dl>
        </header>

        <BuilderCanvas
          onSelectWidget={setSelectedWidgetId}
          screen={selectedWorkspace.screen}
          selectedWidgetId={selectedWidget?.id ?? null}
        />
      </section>

      <BuilderInspector selectedWidget={selectedWidget} widgetCount={selectedWorkspace.screen.widgets.length} />
    </section>
  );
}

function BuilderInspector({
  selectedWidget,
  widgetCount,
}: {
  selectedWidget: WidgetConfig | null;
  widgetCount: number;
}) {
  if (widgetCount === 0) {
    return (
      <aside className="builder-inspector-panel" aria-labelledby="builder-inspector-title">
        <p className="eyebrow">Inspector</p>
        <h2 id="builder-inspector-title">Coming soon</h2>
        <p className="builder-inspector-copy">
          This screen is registered but does not have migrated widgets yet. The builder will keep showing this safe
          empty state until content is available.
        </p>
      </aside>
    );
  }

  if (!selectedWidget) {
    return (
      <aside className="builder-inspector-panel" aria-labelledby="builder-inspector-title">
        <p className="eyebrow">Inspector</p>
        <h2 id="builder-inspector-title">Select a widget</h2>
        <p className="builder-inspector-copy">Choose a widget on the canvas or in the screen list to inspect it.</p>
      </aside>
    );
  }

  return (
    <aside className="builder-inspector-panel" aria-labelledby="builder-inspector-title">
      <p className="eyebrow">Inspector</p>
      <h2 id="builder-inspector-title">{selectedWidget.title}</h2>
      <dl className="builder-inspector-grid">
        <div>
          <dt>Kind</dt>
          <dd>{selectedWidget.kind}</dd>
        </div>
        <div>
          <dt>Position</dt>
          <dd>
            {selectedWidget.layout.x}, {selectedWidget.layout.y}
          </dd>
        </div>
        <div>
          <dt>Size</dt>
          <dd>
            {selectedWidget.layout.width} x {selectedWidget.layout.height}
          </dd>
        </div>
        <div>
          <dt>Settings</dt>
          <dd>{Object.keys(selectedWidget.settings).length} fields</dd>
        </div>
      </dl>
      <p className="builder-inspector-copy">
        Editing controls, drag handles, resize handles, undo/redo, and save actions are the next builder slices.
      </p>
    </aside>
  );
}
