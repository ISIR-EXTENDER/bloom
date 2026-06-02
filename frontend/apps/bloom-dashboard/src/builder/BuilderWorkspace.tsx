import type { ScreenConfig } from "@bloom/api-client";
import {
  addWidgetToScreen,
  createDefaultWidgetRegistry,
  duplicateWidgetInScreen,
  removeWidgetFromScreen,
  updateWidgetSettings,
  updateWidgetTitle,
  type WidgetDefinition,
} from "@bloom/widgets";
import { useEffect, useState } from "react";

import type { LoadedConfiguration } from "../configurations/configuration-loader";
import { resolveSelectedWorkspace, type WorkspaceSelection } from "../ui/ConfigurationWorkspace";
import { BuilderCanvas } from "./BuilderCanvas";
import { BuilderInspector } from "./BuilderInspector";
import { useBuilderScreenDraft } from "./useBuilderScreenDraft";
import { useSelectedBuilderWidget } from "./useSelectedBuilderWidget";

type BuilderWorkspaceProps = {
  configurations: readonly LoadedConfiguration[];
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

export function BuilderWorkspace({
  configurations,
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
  const selectedWidgetDefinition = selectedWidget ? (widgetRegistry.get(selectedWidget.kind) ?? null) : null;
  const [saveState, setSaveState] = useState<DraftSaveState>({ status: "idle" });
  const isSaving = saveState.status === "saving";

  useEffect(() => {
    if (isDirty && saveState.status === "saved") {
      setSaveState({ status: "idle" });
    }
  }, [isDirty, saveState.status]);

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

  const discardDraft = () => {
    resetDraft();
    setSaveState({ status: "idle" });
  };

  const addWidget = (definition: WidgetDefinition) => {
    const widgetId = createUniqueWidgetId(draftScreen, definition.kind);
    const nextScreen = addWidgetToScreen(draftScreen, definition, {
      id: widgetId,
      layout: createNewWidgetLayout(draftScreen, definition),
    });

    commitScreenChange(nextScreen);
    setSelectedWidgetId(widgetId);
  };

  const duplicateSelectedWidget = () => {
    if (!selectedWidget) {
      return;
    }

    const widgetId = createUniqueWidgetId(draftScreen, `${selectedWidget.kind}-copy`);
    const nextScreen = duplicateWidgetInScreen(draftScreen, selectedWidget.id, {
      id: widgetId,
      title: `${selectedWidget.title} copy`,
    });

    commitScreenChange(nextScreen);
    setSelectedWidgetId(widgetId);
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
            <button className="builder-back-button" onClick={onBackToAppConfig} type="button">
              Back to app config
            </button>
            <button className="builder-back-button" onClick={onBackToBuilderHome} type="button">
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
              <dd>{isDirty ? "Unsaved draft" : "Saved"}</dd>
            </div>
          </dl>
          <DraftSaveStatus state={saveState} />
        </header>

        <BuilderCanvas
          onCommitWidgetLayout={commitWidgetLayout}
          onPreviewWidgetLayout={previewWidgetLayout}
          onSelectWidget={setSelectedWidgetId}
          screen={draftScreen}
          selectedWidgetId={selectedWidgetId}
        />
      </section>

      <BuilderInspector
        availableWidgetDefinitions={availableWidgetDefinitions}
        onAddWidget={addWidget}
        onDuplicateWidget={duplicateSelectedWidget}
        onRemoveWidget={removeSelectedWidget}
        onUpdateWidgetSettings={updateSelectedWidgetSettings}
        onUpdateWidgetTitle={updateSelectedWidgetTitle}
        selectedWidget={selectedWidget}
        selectedWidgetDefinition={selectedWidgetDefinition}
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
  if (error instanceof Error) {
    return error.message;
  }

  return "Bloom could not save this builder draft.";
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
