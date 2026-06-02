import type { WidgetConfig } from "@bloom/api-client";
import type { ReactNode } from "react";

type BuilderInspectorProps = {
  selectedWidget: WidgetConfig | null;
  widgetCount: number;
};

export function BuilderInspector({ selectedWidget, widgetCount }: BuilderInspectorProps) {
  if (widgetCount === 0) {
    return (
      <BuilderInspectorPanel title="Coming soon">
        <p className="builder-inspector-copy">
          This screen is registered but does not have migrated widgets yet. The builder will keep showing this safe
          empty state until content is available.
        </p>
      </BuilderInspectorPanel>
    );
  }

  if (!selectedWidget) {
    return (
      <BuilderInspectorPanel title="Select a widget">
        <p className="builder-inspector-copy">Choose a widget on the canvas or in the screen list to inspect it.</p>
      </BuilderInspectorPanel>
    );
  }

  return (
    <BuilderInspectorPanel title={selectedWidget.title}>
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
    </BuilderInspectorPanel>
  );
}

function BuilderInspectorPanel({ children, title }: { children: ReactNode; title: string }) {
  return (
    <aside className="builder-inspector-panel" aria-labelledby="builder-inspector-title">
      <p className="eyebrow">Inspector</p>
      <h2 id="builder-inspector-title">{title}</h2>
      {children}
    </aside>
  );
}
