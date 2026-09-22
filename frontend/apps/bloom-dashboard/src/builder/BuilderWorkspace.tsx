import type { RuntimeCapability, ScreenConfig } from "@bloom/api-client";
import {
  addWidgetToScreen,
  createDefaultWidgetRegistry,
  duplicateWidgetInScreen,
  gripperToggleSettings,
  removeWidgetFromScreen,
  updateWidgetSettings,
  updateWidgetTitle,
  type WidgetDefinition,
} from "@bloom/widgets";
import { useEffect, useState } from "react";

import type { LoadedConfiguration } from "../configurations/configuration-loader";
import { describeApiError } from "../ui/api-error";
import { resolveSelectedWorkspace, type WorkspaceSelection } from "../ui/ConfigurationWorkspace";
import { BuilderCanvas } from "./BuilderCanvas";
import { BuilderInspector } from "./BuilderInspector";
import {
  explainLayoutRefusal,
  findUndersizedWidgets,
  placeClearOfRegions,
  resolveBuilderPanel,
} from "./builder-geometry";
import { useBuilderScreenDraft } from "./useBuilderScreenDraft";
import { useSelectedBuilderWidget } from "./useSelectedBuilderWidget";

type BuilderWorkspaceProps = {
  configurations: readonly LoadedConfiguration[];
  /** Names the arm this deployment drives, so a gripper arrives with that arm's own travel. */
  robotName?: string;
  runtimeCapabilities: readonly RuntimeCapability[] | null;
  onBackToAppConfig: () => void;
  onBackToBuilderHome: () => void;
  onSaveScreenDraft: (screen: ScreenConfig) => Promise<void>;
  selection: WorkspaceSelection;
};

type DraftSaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved" }
  | { status: "error"; message: string };

const widgetRegistry = createDefaultWidgetRegistry();
const availableWidgetDefinitions = Array.from(widgetRegistry.values()).filter(
  (definition) => definition.availability.editor && definition.kind !== "unknown",
);

/** What each class is checked at, named so the inspector can say which panel it measured. */
const CHECKED_PANEL_BY_CLASS = {
  desktop: { height: 900, width: 1440 },
  tablet: { height: 600, width: 1024 },
} as const;

export function BuilderWorkspace({
  configurations,
  robotName,
  runtimeCapabilities,
  onBackToAppConfig,
  onBackToBuilderHome,
  onSaveScreenDraft,
  selection,
}: BuilderWorkspaceProps) {
  const selectedWorkspace = resolveSelectedWorkspace(configurations, selection);
  const {
    canRedo,
    canUndo,
    commitScreenChange,
    commitWidgetLayout,
    draftScreen,
    isDirty,
    previewWidgetLayout,
    redo,
    resetDraft,
    undo,
  } = useBuilderScreenDraft(selectedWorkspace.screen);
  const { selectedWidget, selectedWidgetId, setSelectedWidgetId } = useSelectedBuilderWidget(draftScreen);
  const [saveState, setSaveState] = useState<DraftSaveState>({ status: "idle" });
  const [layoutNotice, setLayoutNotice] = useState<string | null>(null);
  const isSaving = saveState.status === "saving";
  const panel = resolveBuilderPanel(draftScreen);
  const undersizedCount = findUndersizedWidgets(draftScreen).length;

  useEffect(() => {
    if (isDirty && saveState.status === "saved") {
      setSaveState({ status: "idle" });
    }
  }, [isDirty, saveState.status]);

  // A draft lives in this component. Closing the tab or reloading takes it with no trace, which is a
  // bad way for someone authoring without help to learn that Save was a step.
  useEffect(() => {
    if (!isDirty) {
      return;
    }
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  /** Leaving with unsaved work asks first; the wording names what is at stake. */
  const leaveWith = (leave: () => void) => () => {
    if (isDirty && !window.confirm(`${draftScreen.title} has unsaved changes. Leave and lose them?`)) {
      return;
    }
    leave();
  };

  const saveDraft = async () => {
    if (!isDirty || isSaving) {
      return;
    }

    setSaveState({ status: "saving" });

    try {
      await onSaveScreenDraft(draftScreen);
      setSaveState({ status: "saved" });
    } catch (error) {
      setSaveState({ status: "error", message: getErrorMessage(error) });
    }
  };

  const selectWidget = (widgetId: string | null) => {
    setLayoutNotice(null);
    setSelectedWidgetId(widgetId);
  };

  const discardDraft = () => {
    resetDraft();
    setSaveState({ status: "idle" });
  };

  const addWidget = (definition: WidgetDefinition) => {
    const layout = placeClearOfRegions(createNewWidgetLayout(draftScreen, definition), draftScreen);
    if (!layout) {
      setLayoutNotice(
        `A ${definition.displayName} does not fit anywhere on this canvas clear of the reserved regions. Make room first.`,
      );
      return;
    }

    const widgetId = createUniqueWidgetId(draftScreen, definition.kind);
    // A toggle is placed wired to the gripper, and the two arms travel different distances. Giving it
    // the other arm's numbers would be a control that looks right and closes on nothing.
    const placed =
      definition.kind === "toggle" ? { ...definition, defaultSettings: gripperToggleSettings(robotName) } : definition;
    commitScreenChange(addWidgetToScreen(draftScreen, placed, { id: widgetId, layout }));
    setSelectedWidgetId(widgetId);
    setLayoutNotice(null);
  };

  const duplicateSelectedWidget = () => {
    if (!selectedWidget) {
      return;
    }

    const source = selectedWidget.layout;
    const layout = placeClearOfRegions({ ...source, x: source.x + 24, y: source.y + 24 }, draftScreen);
    if (!layout) {
      setLayoutNotice(
        `There is no room for a copy of ${selectedWidget.title} clear of the reserved regions. Make room first.`,
      );
      return;
    }

    const widgetId = createUniqueWidgetId(draftScreen, `${selectedWidget.kind}-copy`);
    const nextScreen = duplicateWidgetInScreen(draftScreen, selectedWidget.id, {
      id: widgetId,
      offset: { x: layout.x - source.x, y: layout.y - source.y },
      title: `${selectedWidget.title} copy`,
    });

    commitScreenChange(nextScreen);
    setSelectedWidgetId(widgetId);
    setLayoutNotice(null);
  };

  // STOP is placed, never removed: the region moves, and a move that would cover a control is refused
  // the way a widget moving into the region is.
  const moveReservedRegion = (regionId: string, next: { x: number; y: number }) => {
    const regions = draftScreen.reserved_regions ?? [];
    const region = regions.find((candidate) => candidate.id === regionId);
    if (!region) {
      return;
    }
    const moved = { ...region, ...next };
    const covered = draftScreen.widgets.find(
      (widget) =>
        widget.layout.x < moved.x + moved.width &&
        widget.layout.x + widget.layout.width > moved.x &&
        widget.layout.y < moved.y + moved.height &&
        widget.layout.y + widget.layout.height > moved.y,
    );
    if (covered) {
      setLayoutNotice(`STOP cannot go there: it would cover ${covered.title}.`);
      return;
    }
    setLayoutNotice(null);
    commitScreenChange({
      ...draftScreen,
      reserved_regions: regions.map((candidate) => (candidate.id === regionId ? moved : candidate)),
    });
  };

  const removeSelectedWidget = () => {
    if (!selectedWidget) {
      return;
    }

    commitScreenChange(removeWidgetFromScreen(draftScreen, selectedWidget.id));
    setSelectedWidgetId(null);
  };

  const updateSelectedWidgetTitle = (title: string) => {
    if (!selectedWidget) {
      return;
    }

    commitScreenChange(updateWidgetTitle(draftScreen, selectedWidget.id, title || "Untitled widget"));
  };

  const updateSelectedWidgetSettings = (settings: Record<string, unknown>): string | null => {
    if (!selectedWidget) {
      return null;
    }

    try {
      commitScreenChange(updateWidgetSettings(draftScreen, selectedWidget.id, settings));
      return null;
    } catch (error) {
      return getErrorMessage(error);
    }
  };

  return (
    <section className="builder-workspace" aria-label="Bloom builder workspace">
      <section className="builder-stage-panel" aria-labelledby="builder-stage-title">
        <header className="builder-stage-toolbar">
          <div className="builder-stage-navigation">
            <button className="builder-back-button" onClick={leaveWith(onBackToAppConfig)} type="button">
              Back to app config
            </button>
            <button className="builder-back-button" onClick={leaveWith(onBackToBuilderHome)} type="button">
              Builder home
            </button>
          </div>
          <div>
            <p className="eyebrow">Builder canvas</p>
            <h2 id="builder-stage-title">{draftScreen.title}</h2>
          </div>
          <div className="builder-stage-actions">
            <button disabled={!isDirty || isSaving} onClick={saveDraft} type="button">
              {isSaving ? "Saving..." : "Save changes"}
            </button>
            <button disabled={!isDirty || isSaving} onClick={discardDraft} type="button">
              Discard
            </button>
            <button disabled={!canUndo} onClick={undo} type="button">
              Undo
            </button>
            <button disabled={!canRedo} onClick={redo} type="button">
              Redo
            </button>
          </div>
          <dl className="builder-stage-meta">
            {/* Tablet and desktop are separate apps: the class follows the screen, so this reports
                it, never sets it. Shown as a reading beside the others, because two framed pills
                with one filled in read as a switch and invite a click that does nothing. */}
            <div>
              <dt>Device</dt>
              <dd>{panel.deviceClass === "desktop" ? "Desktop 1920×1080" : "Tablet 1280×720"}</dd>
            </div>
            <div>
              <dt>Canvas</dt>
              <dd>
                {panel.artboard.width}×{panel.artboard.height}
              </dd>
            </div>
            <div>
              <dt>Widgets</dt>
              <dd>{draftScreen.widgets.length}</dd>
            </div>
            <div>
              <dt>Fit scale</dt>
              <dd>{panel.glassScale.toFixed(2)}</dd>
            </div>
            <div>
              <dt>Mode</dt>
              <dd>{isDirty ? "Unsaved draft" : "Saved"}</dd>
            </div>
          </dl>
          {undersizedCount > 0 ? (
            <p className="builder-undersized-count" role="note">
              {undersizedCount === 1 ? "1 widget below its minimum" : `${undersizedCount} widgets below their minimum`}
            </p>
          ) : null}
          <DraftSaveStatus state={saveState} />
        </header>

        <BuilderCanvas
          onMoveReservedRegion={moveReservedRegion}
          onCommitWidgetLayout={commitWidgetLayout}
          onPreviewWidgetLayout={previewWidgetLayout}
          onSelectWidget={selectWidget}
          screen={draftScreen}
          selectedWidgetId={selectedWidgetId}
        />
      </section>

      <BuilderInspector
        availableWidgetDefinitions={availableWidgetDefinitions}
        canvas={draftScreen.canvas}
        deviceClass={panel.deviceClass}
        glassScale={panel.glassScale}
        panel={CHECKED_PANEL_BY_CLASS[panel.deviceClass]}
        layoutNotice={layoutNotice}
        onResizeWidget={(widgetId, layout) => {
          const widget = draftScreen.widgets.find((candidate) => candidate.id === widgetId);
          if (!widget) {
            return;
          }
          const refusal = explainLayoutRefusal(layout, draftScreen);
          if (refusal) {
            setLayoutNotice(
              `${widget.title} cannot grow to ${layout.width}×${layout.height} here: ${refusal}. Move it first, then resize.`,
            );
            return;
          }
          commitWidgetLayout(widgetId, widget.layout, layout);
          setLayoutNotice(null);
        }}
        runtimeCapabilities={runtimeCapabilities}
        onAddWidget={addWidget}
        onDuplicateWidget={duplicateSelectedWidget}
        onRemoveWidget={removeSelectedWidget}
        onSelectWidget={selectWidget}
        onUpdateWidgetSettings={updateSelectedWidgetSettings}
        onUpdateWidgetTitle={updateSelectedWidgetTitle}
        selectedWidget={selectedWidget}
        widgets={draftScreen.widgets}
        widgetCount={draftScreen.widgets.length}
      />
    </section>
  );
}

function DraftSaveStatus({ state }: { state: DraftSaveState }) {
  if (state.status === "idle") {
    return null;
  }

  if (state.status === "error") {
    return (
      <p className="builder-save-status builder-save-status-error" role="alert">
        {state.message}
      </p>
    );
  }

  return (
    <p className="builder-save-status" role="status">
      {state.status === "saving" ? "Saving draft..." : "All changes saved."}
    </p>
  );
}

function getErrorMessage(error: unknown): string {
  return describeApiError(error, "Bloom could not save this builder draft.");
}

function createNewWidgetLayout(screen: ScreenConfig, definition: WidgetDefinition) {
  const offset = (screen.widgets.length % 8) * 24;

  return {
    x: 32 + offset,
    y: 32 + offset,
    width: definition.defaultLayout.width,
    height: definition.defaultLayout.height,
  };
}

function createUniqueWidgetId(screen: ScreenConfig, baseId: string): string {
  const normalizedBaseId =
    baseId
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-") || "widget";
  const usedIds = new Set(screen.widgets.map((widget) => widget.id));
  let candidateId = `${normalizedBaseId}-${screen.widgets.length + 1}`;
  let suffix = 2;

  while (usedIds.has(candidateId)) {
    candidateId = `${normalizedBaseId}-${screen.widgets.length + suffix}`;
    suffix += 1;
  }

  return candidateId;
}
