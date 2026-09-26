import type { CanvasSettings, WidgetConfig, WidgetLayout } from "@bloom/api-client";
import {
  findSizeShortfall,
  paletteArrivesAs,
  type RuntimeCapability,
  resolveWidgetReadiness,
  type WidgetCategory,
  type WidgetDefinition,
  widgetFitsDeviceClass,
} from "@bloom/widgets";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { BuilderWidgetSettingsEditor } from "./BuilderWidgetSettingsEditor";
import { densityFloorFor, glassPx } from "./builder-geometry";

type BuilderInspectorProps = {
  availableWidgetDefinitions: readonly WidgetDefinition[];
  allowedCommandFrameIds?: readonly string[];
  allowedParameters?: readonly string[];
  allowedTeleopTargets?: readonly string[];
  /** The app's publish list; empty defers to the deployment. */
  allowedPublishTopics?: readonly string[];
  serverTeleopTargets?: readonly string[];
  /** STOP is already reserved on this screen, so the palette says so instead of offering it twice. */
  hasStopRegion?: boolean;
  onAddStopRegion?: () => void;
  /** Offered on a tablet screen, for the widgets that only work on a desktop. */
  onSwitchToDesktop?: () => void;
  canvas?: CanvasSettings;
  deviceClass?: "desktop" | "tablet";
  glassScale?: number;
  panel?: { height: number; width: number };
  /** Why the last add, duplicate or resize was refused. */
  layoutNotice?: string | null;
  onResizeWidget?: (widgetId: string, layout: WidgetLayout) => void;
  /** The arm this Bloom drives, as the capabilities name it. */
  robotName?: string;
  runtimeCapabilities: readonly RuntimeCapability[] | null;
  onAddWidget: (definition: WidgetDefinition) => void;
  onDuplicateWidget: () => void;
  onRemoveWidget: () => void;
  onSelectWidget: (widgetId: string) => void;
  /** A title given with the settings is committed with them, as one change. */
  onUpdateWidgetSettings: (settings: Record<string, unknown>, title?: string) => string | null;
  onUpdateWidgetTitle: (title: string) => void;
  selectedWidget: WidgetConfig | null;
  widgets: readonly WidgetConfig[];
  widgetCount: number;
};

export function BuilderInspector({
  allowedCommandFrameIds,
  allowedParameters,
  allowedTeleopTargets,
  allowedPublishTopics,
  serverTeleopTargets,
  availableWidgetDefinitions,
  hasStopRegion = false,
  onAddStopRegion,
  onSwitchToDesktop,
  canvas,
  deviceClass = "tablet",
  glassScale = 1,
  panel = { height: 600, width: 1024 },
  layoutNotice = null,
  onResizeWidget,
  robotName,
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
          deviceClass={deviceClass}
          capabilities={runtimeCapabilities}
          definitions={availableWidgetDefinitions}
          hasStopRegion={hasStopRegion}
          onAddStopRegion={onAddStopRegion}
          onAddWidget={onAddWidget}
          onSwitchToDesktop={onSwitchToDesktop}
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
          deviceClass={deviceClass}
          capabilities={runtimeCapabilities}
          definitions={availableWidgetDefinitions}
          hasStopRegion={hasStopRegion}
          onAddStopRegion={onAddStopRegion}
          onAddWidget={onAddWidget}
          onSwitchToDesktop={onSwitchToDesktop}
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
        <div data-error={glass < densityFloorFor(deviceClass) ? "true" : undefined}>
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
        allowedCommandFrameIds={allowedCommandFrameIds}
        allowedParameters={allowedParameters}
        allowedPublishTopics={allowedPublishTopics}
        allowedTeleopTargets={allowedTeleopTargets}
        serverTeleopTargets={serverTeleopTargets}
        canvas={canvas}
        floorPx={densityFloorFor(deviceClass)}
        panel={panel}
        key={selectedWidget.id}
        onUpdateSettings={onUpdateWidgetSettings}
        onUpdateTitle={onUpdateWidgetTitle}
        robotName={robotName}
        screenWidgets={widgets}
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
        deviceClass={deviceClass}
        capabilities={runtimeCapabilities}
        definitions={availableWidgetDefinitions}
        hasStopRegion={hasStopRegion}
        onAddStopRegion={onAddStopRegion}
        onAddWidget={onAddWidget}
        onSwitchToDesktop={onSwitchToDesktop}
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
  deviceClass,
  hasStopRegion,
  onAddStopRegion,
  onAddWidget,
  onSwitchToDesktop,
}: {
  capabilities: readonly RuntimeCapability[] | null;
  definitions: readonly WidgetDefinition[];
  deviceClass?: "desktop" | "tablet";
  hasStopRegion?: boolean;
  onAddStopRegion?: () => void;
  /** Offered on a tablet screen, for the widgets that only work on a desktop. */
  onSwitchToDesktop?: () => void;
  onAddWidget: (definition: WidgetDefinition) => void;
}) {
  const [query, setQuery] = useState("");
  const terms = searchTerms(query);
  const showStop = onAddStopRegion && matchesSearch(terms, ["STOP", "Stop the robot", "emergency"]);
  const matching = definitions.filter((definition) =>
    matchesSearch(terms, [
      definition.displayName,
      definition.kind,
      definition.description,
      PALETTE_CATEGORIES.find((category) => category.id === definition.category)?.label ?? "",
    ]),
  );
  return (
    <section className="builder-widget-palette" aria-labelledby="builder-widget-palette-title">
      <div>
        <p className="eyebrow">Widget palette</p>
        <h3 id="builder-widget-palette-title">Add widgets</h3>
      </div>
      <input
        aria-label="Search widgets"
        className="builder-widget-palette-search"
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search: joystick, camera, 3D…"
        type="search"
        value={query}
      />
      {onSwitchToDesktop && definitions.some((definition) => !widgetFitsDeviceClass(definition, deviceClass)) ? (
        <p className="builder-widget-palette-device">
          Widgets marked Desktop only need a desktop screen.{" "}
          <button className="builder-secondary-action" onClick={onSwitchToDesktop} type="button">
            Switch this screen to desktop
          </button>
        </p>
      ) : null}
      {!showStop && matching.length === 0 ? (
        <p className="builder-widget-palette-empty">No widget matches “{query.trim()}”.</p>
      ) : null}
      {showStop ? (
        <div>
          <h4 className="builder-widget-palette-category">Stop the robot</h4>
          <div className="builder-widget-palette-grid">
            {/* Robin, 2026-09-21: "je ne trouve pas le bouton stop dans le builder". It is placed like
                any other control, and it reserves its box so nothing else can sit under it. */}
            <button
              aria-label={hasStopRegion ? "STOP is already on this screen" : "Add STOP"}
              data-readiness={hasStopRegion ? "placed" : undefined}
              disabled={hasStopRegion}
              onClick={onAddStopRegion}
              type="button"
            >
              <strong>STOP</strong>
              <small className="builder-widget-palette-note">
                {hasStopRegion
                  ? "Already on this screen. Drag it on the canvas to move it."
                  : "Reserves its box; the runtime draws it and latches in the backend."}
              </small>
            </button>
          </div>
        </div>
      ) : null}
      {PALETTE_CATEGORIES.map(({ id, label }) => {
        const inCategory = matching.filter((definition) => definition.category === id);
        if (inCategory.length === 0) {
          return null;
        }
        return (
          <div key={id}>
            <h4 className="builder-widget-palette-category">{label}</h4>
            <div className="builder-widget-palette-grid">
              {inCategory.map((definition) => {
                const fitsClass = widgetFitsDeviceClass(definition, deviceClass);
                const readiness = fitsClass
                  ? resolveWidgetReadiness(definition, capabilities)
                  : { state: "unavailable" as const, note: "Desktop screens only." };
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
                    disabled={!fitsClass}
                    key={definition.kind}
                    onClick={() => onAddWidget(definition)}
                    type="button"
                  >
                    <strong>{definition.displayName}</strong>
                    {paletteArrivesAs(definition.kind) ? (
                      <small className="builder-widget-palette-arrives">
                        Arrives as {paletteArrivesAs(definition.kind)}
                      </small>
                    ) : null}
                    {readiness.state === "unavailable" ? (
                      <em className="builder-widget-palette-flag">{fitsClass ? "Not connected" : "Desktop only"}</em>
                    ) : null}
                    {readiness.state === "preview" ? <em className="builder-widget-palette-flag">Preview</em> : null}
                    {readiness.note ? <small className="builder-widget-palette-note">{readiness.note}</small> : null}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </section>
  );
}

/**
 * The palette in the order someone builds a screen: drive it, command it, then read it back.
 *
 * Nineteen widgets in one flat grid, each printing its own category underneath, asked an author to
 * do the grouping in their head every time. `unknown` is not offered, so it is not listed.
 */
const PALETTE_CATEGORIES: readonly { id: WidgetCategory; label: string }[] = [
  { id: "input", label: "Drive the robot" },
  { id: "command", label: "Send a command" },
  { id: "display", label: "See what it is doing" },
  { id: "feedback", label: "Read the data" },
  { id: "device", label: "Devices" },
];

function searchTerms(query: string): string[] {
  return foldForSearch(query).split(/\s+/).filter(Boolean);
}

/** Every term must appear in one of the fields; case and accents are ignored. */
export function matchesSearch(terms: readonly string[], fields: readonly string[]): boolean {
  const haystack = foldForSearch(fields.join(" "));
  return terms.every((term) => haystack.includes(term));
}

function foldForSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
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
