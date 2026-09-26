import type { RuntimeCapability, ScreenConfig } from "@bloom/api-client";
import {
  addWidgetToScreen,
  createDefaultWidgetRegistry,
  duplicateWidgetInScreen,
  gripperToggleSettings,
  minSizeFor,
  removeWidgetFromScreen,
  robotFamily,
  speedSliderSettings,
  translationPadSettings,
  updateWidgetSettings,
  updateWidgetTitle,
  type WidgetDefinition,
} from "@bloom/widgets";
import { useEffect, useState } from "react";

import type { LoadedConfiguration } from "../configurations/configuration-loader";
import { describeApiError } from "../ui/api-error";
import { resolveSelectedWorkspace, type WorkspaceSelection } from "../ui/ConfigurationWorkspace";
import { leaveAfterConfirming, useUnsavedChanges } from "../ui/unsaved-changes";
import { BuilderCanvas } from "./BuilderCanvas";
import { BuilderInspector } from "./BuilderInspector";
import {
  defaultStopRegion,
  explainLayoutRefusal,
  findOverlappedWidget,
  findUndersizedWidgets,
  overlapsRegion,
  placeClearOfRegions,
  placeClearOfWidgets,
  resolveBuilderPanel,
  switchScreenDevice,
} from "./builder-geometry";
import { useBuilderScreenDraft } from "./useBuilderScreenDraft";
import { useSelectedBuilderWidget } from "./useSelectedBuilderWidget";

const ROBOT_AWARE_SETTINGS: Partial<Record<string, (robotName?: string) => Record<string, unknown>>> = {
  joystick: translationPadSettings,
  slider: speedSliderSettings,
  toggle: gripperToggleSettings,
};

type BuilderWorkspaceProps = {
  /** The frames this robot accepts, so a pad can be told to turn in one of them. */
  commandFrameIds?: readonly string[];
  serverTeleopTargets?: readonly string[];
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
  commandFrameIds,
  serverTeleopTargets,
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
  const unsavedMessage = `${draftScreen.title} has unsaved changes. Leave and lose them?`;
  useUnsavedChanges(isDirty, unsavedMessage);
  const leaveWith = (leave: () => void) => () => leaveAfterConfirming(isDirty, unsavedMessage, leave);

  const saveDraft = async () => {
    if (!isDirty || isSaving) {
      return;
    }

    setSaveState({ status: "saving" });

    try {
      await onSaveScreenDraft(draftScreen);
      setSaveState({ status: "saved" });
    } catch (error) {
      setSaveState({ status: "error", message: describeApiError(error, "Bloom could not save this builder draft.") });
    }
  };

  const selectWidget = (widgetId: string | null) => {
    setLayoutNotice(null);
    setSelectedWidgetId(widgetId);
  };

  const discardDraft = () => {
    // Discard also clears undo, so it cannot be taken back.
    if (!window.confirm(`Discard your changes to ${draftScreen.title}? This cannot be undone.`)) {
      return;
    }
    resetDraft();
    setSaveState({ status: "idle" });
  };

  const addWidget = (definition: WidgetDefinition) => {
    // Clear of what is already on the screen, not only of the regions: five widgets from the palette
    // used to land in one heap, stepping 24 px each, which for a 280 px joystick is not a layout.
    const layout = placeClearOfWidgets(
      createNewWidgetLayout(draftScreen, definition),
      draftScreen,
      minSizeFor(definition.kind, definition.defaultSettings),
    );
    if (!layout) {
      setLayoutNotice(
        `A ${definition.displayName} does not fit anywhere on this canvas clear of the reserved regions. Make room first.`,
      );
      return;
    }

    const widgetId = createUniqueWidgetId(draftScreen, definition.kind);
    // Gripper travel, pad axes and speed range differ per arm: the other arm's numbers would look right and do wrong.
    // A series picker drives a plot board; placed beside one, it drives that one.
    const robotAware = ROBOT_AWARE_SETTINGS[definition.kind];
    const board = draftScreen.widgets.find((widget) => widget.kind === "plot-board");
    const placed = robotAware
      ? { ...definition, defaultSettings: robotAware(robotName) }
      : definition.kind === "plot-picker" && board
        ? { ...definition, defaultSettings: { ...definition.defaultSettings, plot_id: board.id } }
        : definition;
    const covered = findOverlappedWidget(layout, draftScreen);
    commitScreenChange(linkOrphanPickers(addWidgetToScreen(draftScreen, placed, { id: widgetId, layout })));
    setSelectedWidgetId(widgetId);
    const notices = [
      covered &&
        `No free space left: ${definition.displayName} was placed over ${covered.title}. Drag it clear, or it cannot be pressed at runtime.`,
      robotAware &&
        !robotFamily(robotName) &&
        `Bloom does not know which arm it drives (BLOOM_ROBOT_NAME is "${robotName ?? ""}"), so the ${definition.displayName} has the Explorer's values. Check them before driving another arm.`,
    ].filter(Boolean);
    setLayoutNotice(notices.length ? notices.join(" ") : null);
  };

  /**
   * STOP, added from the palette like anything else.
   *
   * Robin could not find it in the Builder, and 28 shipped screens carry no stop region at all with
   * no way to put one back. The runtime still draws it, so this reserves the box rather than placing
   * a widget: that is what keeps every control clear of it and what makes the screen full-panel.
   */
  const addStopRegion = () => {
    const region = defaultStopRegion(draftScreen.canvas);
    const covered = draftScreen.widgets.find((widget) => overlapsRegion(widget.layout, [region]));
    if (covered) {
      setLayoutNotice(`STOP would land on ${covered.title}. Move it out of the bottom right corner, then add STOP.`);
      return;
    }

    commitScreenChange({
      ...draftScreen,
      reserved_regions: [...(draftScreen.reserved_regions ?? []), region],
    });
    setLayoutNotice(null);
  };

  const duplicateSelectedWidget = () => {
    if (!selectedWidget) {
      return;
    }

    const source = selectedWidget.layout;
    // Clear of the other widgets as a palette placement is: 24 px down-right sat the copy on the original.
    const layout = placeClearOfWidgets({ ...source, x: source.x + 24, y: source.y + 24 }, draftScreen);
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
    const covered = findOverlappedWidget(layout, draftScreen);

    commitScreenChange(nextScreen);
    setSelectedWidgetId(widgetId);
    setLayoutNotice(
      covered
        ? `No free space left: the copy was placed over ${covered.title}. Drag it clear, or it cannot be pressed at runtime.`
        : null,
    );
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

  const switchDevice = (deviceClass: "desktop" | "tablet") => {
    const result = switchScreenDevice(draftScreen, deviceClass);
    if (result.refusal !== undefined) {
      setLayoutNotice(result.refusal);
      return;
    }
    commitScreenChange(result.screen);
    setLayoutNotice(`Now a ${deviceClass} screen: widgets and STOP were rescaled together. Check sizes, then save.`);
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
      return describeApiError(error, "Bloom could not save this builder draft.");
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
            {/* A reading plus one explicit action: two pills with one filled read as a switch that does nothing. */}
            <div>
              <dt>Device</dt>
              <dd>
                {panel.deviceClass === "desktop" ? "Desktop" : "Tablet"} {panel.preset.width}×{panel.preset.height}{" "}
                <button
                  className="builder-device-switch"
                  onClick={() => switchDevice(panel.deviceClass === "desktop" ? "tablet" : "desktop")}
                  type="button"
                >
                  {panel.deviceClass === "desktop" ? "Switch to tablet" : "Switch to desktop"}
                </button>
              </dd>
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
          onRefuseWidgetLayout={setLayoutNotice}
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
        allowedCommandFrameIds={commandFrameIds}
        allowedParameters={selectedWorkspace.application.runtime_policy.allowed_parameters ?? []}
        allowedTeleopTargets={selectedWorkspace.application.runtime_policy.allowed_teleop_targets}
        serverTeleopTargets={serverTeleopTargets}
        hasStopRegion={(draftScreen.reserved_regions ?? []).some((region) => region.id === "stop")}
        onAddStopRegion={addStopRegion}
        onAddWidget={addWidget}
        onSwitchToDesktop={panel.deviceClass === "tablet" ? () => switchDevice("desktop") : undefined}
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

/** A series picker placed before its board, or left pointing at a removed one, takes the board that arrives. */
function linkOrphanPickers(screen: ScreenConfig): ScreenConfig {
  const boards = screen.widgets.filter((widget) => widget.kind === "plot-board");
  const board = boards.at(-1);
  if (!board) {
    return screen;
  }
  const boardIds = new Set(boards.map((candidate) => candidate.id));
  return {
    ...screen,
    widgets: screen.widgets.map((widget) =>
      widget.kind === "plot-picker" && !boardIds.has(String(widget.settings.plot_id ?? ""))
        ? { ...widget, settings: { ...widget.settings, plot_id: board.id } }
        : widget,
    ),
  };
}
