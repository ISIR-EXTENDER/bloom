import type { CanvasSettings, WidgetConfig } from "@bloom/api-client";
import { type RuntimeCapability, resolveWidgetReadiness, type WidgetDefinition } from "@bloom/widgets";
import type { ReactNode } from "react";
import { BuilderWidgetSettingsEditor } from "./BuilderWidgetSettingsEditor";

type BuilderInspectorProps = {
  availableWidgetDefinitions: readonly WidgetDefinition[];
  canvas?: CanvasSettings;
  runtimeCapabilities: readonly RuntimeCapability[] | null;
  onAddWidget: (definition: WidgetDefinition) => void;
  onDuplicateWidget: () => void;
  onRemoveWidget: () => void;
  onSelectWidget: (widgetId: string) => void;
  onUpdateWidgetSettings: (settings: Record<string, unknown>) => string | null;
  onUpdateWidgetTitle: (title: string) => void;
  selectedWidget: WidgetConfig | null;
  widgets: readonly WidgetConfig[];
  widgetCount: number;
};

export function BuilderInspector({
  availableWidgetDefinitions,
  canvas,
  runtimeCapabilities,
  onAddWidget,
  onDuplicateWidget,
  onRemoveWidget,
  onSelectWidget,
  onUpdateWidgetSettings,
  onUpdateWidgetTitle,
  selectedWidget,
  widgets,
  widgetCount,
}: BuilderInspectorProps) {
  if (widgetCount === 0) {
    return (
      <BuilderInspectorPanel title="Coming soon">
        <p className="builder-inspector-copy">
          This screen is registered but does not have migrated widgets yet. The builder will keep showing this safe
          empty state until content is available.
        </p>
        <WidgetPalette
          capabilities={runtimeCapabilities}
          definitions={availableWidgetDefinitions}
          onAddWidget={onAddWidget}
        />
      </BuilderInspectorPanel>
    );
  }

  if (!selectedWidget) {
    return (
      <BuilderInspectorPanel title="Select a widget">
        <p className="builder-inspector-copy">Choose a widget on the canvas or in the screen list to inspect it.</p>
        <WidgetList onSelectWidget={onSelectWidget} selectedWidgetId={null} widgets={widgets} />
        <WidgetPalette
          capabilities={runtimeCapabilities}
          definitions={availableWidgetDefinitions}
          onAddWidget={onAddWidget}
        />
      </BuilderInspectorPanel>
    );
  }

  return (
    <BuilderInspectorPanel title={selectedWidget.title}>
      <WidgetList onSelectWidget={onSelectWidget} selectedWidgetId={selectedWidget.id} widgets={widgets} />
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
        Use duplicate or remove for quick layout iteration. Settings are rendered from the widget contract.
      </p>
      <BuilderWidgetSettingsEditor
        canvas={canvas}
        key={selectedWidget.id}
        onUpdateSettings={onUpdateWidgetSettings}
        onUpdateTitle={onUpdateWidgetTitle}
        widget={selectedWidget}
      />
      <div className="builder-inspector-actions">
        <button onClick={onDuplicateWidget} type="button">
          Duplicate widget
        </button>
        <button onClick={onRemoveWidget} type="button">
          Remove widget
        </button>
      </div>
      <WidgetPalette
        capabilities={runtimeCapabilities}
        definitions={availableWidgetDefinitions}
        onAddWidget={onAddWidget}
      />
    </BuilderInspectorPanel>
  );
}

function WidgetList({
  onSelectWidget,
  selectedWidgetId,
  widgets,
}: {
  onSelectWidget: (widgetId: string) => void;
  selectedWidgetId: string | null;
  widgets: readonly WidgetConfig[];
}) {
  if (widgets.length === 0) {
    return null;
  }

  return (
    <section className="builder-widget-list" aria-labelledby="builder-widget-list-title">
      <div>
        <p className="eyebrow">Screen widgets</p>
        <h3 id="builder-widget-list-title">Select on canvas</h3>
      </div>
      <div className="builder-widget-list-items">
        {widgets.map((widget) => (
          <button
            aria-pressed={widget.id === selectedWidgetId}
            key={widget.id}
            onClick={() => onSelectWidget(widget.id)}
            type="button"
          >
            <strong>{widget.title}</strong>
            <span>
              {widget.kind} · {widget.layout.x}, {widget.layout.y}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function WidgetPalette({
  capabilities,
  definitions,
  onAddWidget,
}: {
  capabilities: readonly RuntimeCapability[] | null;
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
        {definitions.map((definition) => {
          const readiness = resolveWidgetReadiness(definition, capabilities);
          // A widget that cannot work here stays in the palette, marked. Hiding
          // it would leave someone hunting for a widget that used to be there.
          return (
            <button
              aria-label={
                readiness.note
                  ? `Add ${definition.displayName} widget. ${readiness.note}`
                  : `Add ${definition.displayName} widget`
              }
              data-readiness={readiness.state === "ready" ? undefined : readiness.state}
              key={definition.kind}
              onClick={() => onAddWidget(definition)}
              type="button"
            >
              <strong>{definition.displayName}</strong>
              <span>{definition.category}</span>
              {readiness.state === "unavailable" ? (
                <em className="builder-widget-palette-flag">Not connected</em>
              ) : null}
              {readiness.state === "preview" ? <em className="builder-widget-palette-flag">Preview</em> : null}
              {readiness.note ? <small className="builder-widget-palette-note">{readiness.note}</small> : null}
            </button>
          );
        })}
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
