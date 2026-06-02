import type { WidgetConfig } from "@bloom/api-client";
import type { WidgetDefinition } from "@bloom/widgets";
import type { ReactNode } from "react";

type BuilderInspectorProps = {
  availableWidgetDefinitions: readonly WidgetDefinition[];
  onAddWidget: (definition: WidgetDefinition) => void;
  onDuplicateWidget: () => void;
  onRemoveWidget: () => void;
  selectedWidget: WidgetConfig | null;
  widgetCount: number;
};

export function BuilderInspector({
  availableWidgetDefinitions,
  onAddWidget,
  onDuplicateWidget,
  onRemoveWidget,
  selectedWidget,
  widgetCount,
}: BuilderInspectorProps) {
  if (widgetCount === 0) {
    return (
      <BuilderInspectorPanel title="Coming soon">
        <p className="builder-inspector-copy">
          This screen is registered but does not have migrated widgets yet. The builder will keep showing this safe
          empty state until content is available.
        </p>
        <WidgetPalette definitions={availableWidgetDefinitions} onAddWidget={onAddWidget} />
      </BuilderInspectorPanel>
    );
  }

  if (!selectedWidget) {
    return (
      <BuilderInspectorPanel title="Select a widget">
        <p className="builder-inspector-copy">Choose a widget on the canvas or in the screen list to inspect it.</p>
        <WidgetPalette definitions={availableWidgetDefinitions} onAddWidget={onAddWidget} />
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
        Use duplicate or remove for quick layout iteration. Full settings controls are the next builder slice.
      </p>
      <div className="builder-inspector-actions">
        <button onClick={onDuplicateWidget} type="button">
          Duplicate widget
        </button>
        <button onClick={onRemoveWidget} type="button">
          Remove widget
        </button>
      </div>
      <WidgetPalette definitions={availableWidgetDefinitions} onAddWidget={onAddWidget} />
    </BuilderInspectorPanel>
  );
}

function WidgetPalette({
  definitions,
  onAddWidget,
}: {
  definitions: readonly WidgetDefinition[];
  onAddWidget: (definition: WidgetDefinition) => void;
}) {
  return (
    <section className="builder-widget-palette" aria-labelledby="builder-widget-palette-title">
      <div>
        <p className="eyebrow">Widget palette</p>
        <h3 id="builder-widget-palette-title">Add widgets</h3>
      </div>
      <div className="builder-widget-palette-grid">
        {definitions.map((definition) => (
          <button
            aria-label={`Add ${definition.displayName} widget`}
            key={definition.kind}
            onClick={() => onAddWidget(definition)}
            type="button"
          >
            <strong>{definition.displayName}</strong>
            <span>{definition.category}</span>
          </button>
        ))}
      </div>
    </section>
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
