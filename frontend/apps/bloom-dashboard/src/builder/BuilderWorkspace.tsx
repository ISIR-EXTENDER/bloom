import type { ScreenConfig } from "@bloom/api-client";
import { useEffect, useState } from "react";

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
  onSaveScreenDraft: (screen: ScreenConfig) => Promise<void>;
  selection: WorkspaceSelection;
};

type DraftSaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved" }
  | { status: "error"; message: string };

export function BuilderWorkspace({
  configurations,
  onSaveScreenDraft,
  onSelectionChange,
  selection,
}: BuilderWorkspaceProps) {
  const selectedWorkspace = resolveSelectedWorkspace(configurations, selection);
  const { canRedo, canUndo, commitWidgetLayout, draftScreen, isDirty, previewWidgetLayout, redo, resetDraft, undo } =
    useBuilderScreenDraft(selectedWorkspace.screen);
  const { selectedWidget, selectedWidgetId, setSelectedWidgetId } = useSelectedBuilderWidget(draftScreen);
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

      <BuilderInspector selectedWidget={selectedWidget} widgetCount={draftScreen.widgets.length} />
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
