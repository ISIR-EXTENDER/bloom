import type { CanvasSettings, WidgetConfig, WidgetLayout } from "@bloom/api-client";
import {
  findSizeShortfall,
  type RuntimeCapability,
  resolveWidgetReadiness,
  type WidgetDefinition,
} from "@bloom/widgets";
import { type ReactNode, useEffect, useRef } from "react";
import { BuilderWidgetSettingsEditor } from "./BuilderWidgetSettingsEditor";
import { densityFloorFor, glassPx, TOUCH_FLOOR_PX } from "./builder-geometry";

type BuilderInspectorProps = {
  availableWidgetDefinitions: readonly WidgetDefinition[];
  canvas?: CanvasSettings;
  deviceClass?: "desktop" | "tablet";
  glassScale?: number;
  panel?: { height: number; width: number };
  /** Why the last add, duplicate or resize was refused. */
  layoutNotice?: string | null;
  onResizeWidget?: (widgetId: string, layout: WidgetLayout) => void;
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
  deviceClass = "tablet",
  glassScale = 1,
  panel = { height: 600, width: 1024 },
  layoutNotice = null,
  onResizeWidget,
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
      <BuilderInspectorPanel notice={layoutNotice} title="Add a widget">
        <p className="builder-inspector-copy">
          Pick a widget to place it on the canvas, then drag to move it and use the corner handle to resize.
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
      <BuilderInspectorPanel notice={layoutNotice} title="Select a widget">
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

  const shortfall = findSizeShortfall(selectedWidget);
  const glass = glassPx(selectedWidget, glassScale);

  return (
    <BuilderInspectorPanel notice={layoutNotice} title={selectedWidget.title}>
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
        <div data-error={shortfall ? "true" : undefined}>
          <dt>Size</dt>
          <dd>
            {selectedWidget.layout.width} × {selectedWidget.layout.height}
          </dd>
        </div>
        <div data-error={glass < TOUCH_FLOOR_PX ? "true" : undefined}>
          <dt>Glass at fit {glassScale.toFixed(2)}</dt>
          <dd>{glass} px</dd>
        </div>
      </dl>
      {shortfall ? (
        <section aria-label="Below minimum size" className="builder-minimum-warning">
          <h3>Below minimum size</h3>
          <p>
            A {selectedWidget.kind} with these settings needs {shortfall.minimum[0]}×{shortfall.minimum[1]}. At{" "}
            {shortfall.width}×{shortfall.height} its content cannot all fit, so the card grows past its slot.
          </p>
          <button
            onClick={() =>
              onResizeWidget?.(selectedWidget.id, {
                ...selectedWidget.layout,
                height: Math.max(selectedWidget.layout.height, shortfall.minimum[1]),
                width: Math.max(selectedWidget.layout.width, shortfall.minimum[0]),
              })
            }
            type="button"
          >
            Resize to {Math.max(selectedWidget.layout.width, shortfall.minimum[0])}×
            {Math.max(selectedWidget.layout.height, shortfall.minimum[1])}
          </button>
        </section>
      ) : null}
      <p className="builder-inspector-copy">
        Use duplicate or remove for quick layout iteration. Settings are rendered from the widget contract.
      </p>
      <BuilderWidgetSettingsEditor
        canvas={canvas}
        floorPx={densityFloorFor(deviceClass)}
        panel={panel}
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
  const selectedRef = useRef<HTMLButtonElement | null>(null);

  // The list scrolls; a widget picked on the canvas should come into view in it.
  useEffect(() => {
    if (selectedWidgetId) {
      selectedRef.current?.scrollIntoView?.({ block: "nearest" });
    }
  }, [selectedWidgetId]);

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
            ref={widget.id === selectedWidgetId ? selectedRef : undefined}
            onClick={() => onSelectWidget(widget.id)}
            type="button"
          >
            <strong>{widget.title}</strong>
            <span>
              {widget.kind} · {widget.layout.x}, {widget.layout.y}
            </span>
            {findSizeShortfall(widget) ? <em className="builder-widget-too-small">Too small</em> : null}
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

function BuilderInspectorPanel({
  children,
  notice,
  title,
}: {
  children: ReactNode;
  notice: string | null;
  title: string;
}) {
  return (
    <aside className="builder-inspector-panel" aria-labelledby="builder-inspector-title">
      <p className="eyebrow">Inspector</p>
      <h2 id="builder-inspector-title">{title}</h2>
      {notice ? (
        <p className="builder-layout-notice" role="alert">
          {notice}
        </p>
      ) : null}
      {children}
    </aside>
  );
}
