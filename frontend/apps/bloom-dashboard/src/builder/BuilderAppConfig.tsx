import type { ApplicationConfig, RuntimeCapabilityReport } from "@bloom/api-client";
import { useMemo, useState } from "react";
import type { LoadedConfiguration } from "../configurations/configuration-loader";
import { resolveSelectedWorkspace, type WorkspaceSelection } from "../ui/ConfigurationWorkspace";
import { useUnsavedChanges } from "../ui/unsaved-changes";
import { type AppSaveState, collectAvailableScreens } from "./app-config-model";
import { BuilderActionPresetsPanel } from "./BuilderActionPresetsPanel";
import { BuilderAdapterGuardrailsPanel } from "./BuilderAdapterGuardrailsPanel";
import { BuilderAppDetailsPanel } from "./BuilderAppDetailsPanel";
import { BuilderAppScreensPanel } from "./BuilderAppScreensPanel";
import { BuilderAppThemePanel } from "./BuilderAppThemePanel";
import { BuilderGuidedTour } from "./BuilderGuidedTour";
import { BuilderProfilesPanel } from "./BuilderProfilesPanel";
import { readDeploymentAllowlists } from "./BuilderWidgetSummaries";
import { countLabel } from "./builderHomeModel";
import { useApplicationDraft } from "./use-application-draft";

type BuilderAppConfigProps = {
  configurations: readonly LoadedConfiguration[];
  onBackToHome: () => void;
  onOpenRuntimeApp: (selection: WorkspaceSelection) => void;
  onOpenScreenBuilder: (selection: WorkspaceSelection) => void;
  onSaveApplication: (application: ApplicationConfig) => Promise<void>;
  onUploadThemeAsset: (file: File) => Promise<string>;
  runtimeCapabilityReport: RuntimeCapabilityReport | null;
  selection: WorkspaceSelection;
};

export function BuilderAppConfig({
  configurations,
  onBackToHome,
  onOpenRuntimeApp,
  onOpenScreenBuilder,
  onSaveApplication,
  onUploadThemeAsset,
  runtimeCapabilityReport,
  selection,
}: BuilderAppConfigProps) {
  const selectedWorkspace = resolveSelectedWorkspace(configurations, selection);
  const { application } = selectedWorkspace;
  const [tourOpen, setTourOpen] = useState(false);
  const siblingApplications = useMemo(
    () =>
      configurations
        .find((configuration) => configuration.id === selection.configId)
        ?.bundle.applications.filter((candidate) => candidate.id !== selection.appId) ?? [],
    [configurations, selection.appId, selection.configId],
  );
  const availableScreens = collectAvailableScreens(selectedWorkspace.bundle.applications);
  const supportedCommandFrameIds = runtimeCapabilityReport?.command_frame_ids;
  const deploymentAllowlists = useMemo(
    () => readDeploymentAllowlists(runtimeCapabilityReport),
    [runtimeCapabilityReport],
  );
  // Resolved against the draft below; the hook cannot know the robot's frames.
  const isCommandFrameUnavailable = (draft: ApplicationConfig) => {
    const frameId = draft.runtime_policy.command_frame_id ?? "";
    return Boolean(supportedCommandFrameIds && frameId && !supportedCommandFrameIds.includes(frameId));
  };
  const editor = useApplicationDraft({
    application,
    availableScreens,
    canSave: (draft) => !isCommandFrameUnavailable(draft),
    onSaveApplication,
    onUploadThemeAsset,
  });
  const { draft, isDirty, isSaving, saveState } = editor;
  const commandFrameUnavailable = isCommandFrameUnavailable(draft);
  useUnsavedChanges(isDirty, `${application.name} has unsaved changes. Leave and lose them?`);
  // The screen last opened, else the app's first; the saved app is what the runtime shows.
  const previewScreenId = application.screens.some((screen) => screen.id === selection.screenId)
    ? selection.screenId
    : application.screens[0]?.id;
  const previewSelection = previewScreenId
    ? { appId: application.id, configId: selectedWorkspace.configuration.id, screenId: previewScreenId }
    : null;

  if (tourOpen) {
    return (
      <BuilderGuidedTour
        application={draft}
        deployment={deploymentAllowlists}
        siblings={siblingApplications}
        onClose={() => setTourOpen(false)}
        onOpenConfiguration={() => setTourOpen(false)}
        onOpenHome={onBackToHome}
        onOpenScreenBuilder={onOpenScreenBuilder}
        onPreviewRuntime={onOpenRuntimeApp}
        selection={selection}
      />
    );
  }

  return (
    <section className="builder-app-config" aria-labelledby="builder-app-config-title">
      <header className="builder-app-config-header">
        <div>
          <p className="eyebrow">App configuration</p>
          <h1 id="builder-app-config-title">{draft.name}</h1>
          <p>
            Configure the app identity, visual language, and screens before opening a screen in the full WYSIWYG
            builder.
          </p>
          <div className="builder-app-summary">
            <span>{countLabel(draft.screens.length, "screen")}</span>
            <span>
              {countLabel(
                draft.screens.reduce((count, screen) => count + screen.widgets.length, 0),
                "widget",
              )}
            </span>
            <span>{draft.theme.preset_id}</span>
          </div>
        </div>
        <div className="builder-app-config-actions">
          <button disabled={isDirty || isSaving} onClick={() => setTourOpen(true)} type="button">
            {isDirty ? "Review checklist (save first)" : "Review checklist"}
          </button>
          <button
            disabled={isDirty || isSaving || !previewSelection}
            onClick={() => previewSelection && onOpenRuntimeApp(previewSelection)}
            type="button"
          >
            {isDirty ? "Preview (save first)" : "Preview"}
          </button>
          <button className="builder-back-button" onClick={onBackToHome} type="button">
            Back to apps
          </button>
          <button
            disabled={!isDirty || isSaving || commandFrameUnavailable}
            onClick={() => void editor.saveDraft()}
            type="button"
          >
            {isSaving ? "Saving..." : "Save app"}
          </button>
          <button
            disabled={!isDirty || isSaving}
            onClick={() => {
              if (window.confirm(`Discard your changes to ${application.name}? This cannot be undone.`)) {
                editor.discard();
              }
            }}
            type="button"
          >
            Discard
          </button>
        </div>
        <AppSaveStatus state={saveState} />
      </header>

      <div className="builder-app-config-grid">
        <aside className="builder-app-config-sidebar" aria-label="Application settings">
          <BuilderAppDetailsPanel application={draft} isDirty={isDirty} onChange={editor.patchApplication} />
          <BuilderAdapterGuardrailsPanel
            commandFrameUnavailable={commandFrameUnavailable}
            onCommandFrameChange={(frameId) => editor.updateRuntimePolicy({ command_frame_id: frameId })}
            onPolicyListChange={editor.updateRuntimePolicyList}
            onSyncFromPresets={editor.syncRuntimePolicyFromActionPresets}
            policy={draft.runtime_policy}
            runtimeCapabilityReport={runtimeCapabilityReport}
          />
          <BuilderActionPresetsPanel
            newPreset={editor.newPreset}
            onAddLibraryPreset={editor.addLibraryActionPreset}
            onAddPreset={editor.addActionPreset}
            onNewPresetChange={editor.setNewPreset}
            onRemovePreset={editor.removeActionPreset}
            presets={draft.action_presets}
            robotName={runtimeCapabilityReport?.robot_name}
          />
          <BuilderAppThemePanel
            inspirationError={editor.themeInspirationError}
            onInspirationChange={editor.updateThemeInspiration}
            onMoodboardFile={(file) => void editor.loadMoodboardFile(file)}
            onThemeChange={editor.updateTheme}
            theme={draft.theme}
          />
        </aside>

        <BuilderProfilesPanel
          application={draft}
          onAddProfile={editor.addProfile}
          onRemoveProfile={editor.removeProfile}
          onUpdateProfile={editor.updateProfile}
        />

        <BuilderAppScreensPanel
          isDirty={isDirty}
          isSaving={isSaving}
          newScreenDevice={editor.newScreenDevice}
          newScreenName={editor.newScreenName}
          onAddScreen={editor.addScreen}
          onAddScreenById={editor.addScreenById}
          onCreateScreen={editor.createScreen}
          onDuplicateScreen={editor.duplicateScreen}
          onMoveScreenBefore={editor.moveScreenBefore}
          onNewScreenDeviceChange={editor.setNewScreenDevice}
          onNewScreenNameChange={editor.setNewScreenName}
          onOpenScreenBuilder={(screenId) =>
            onOpenScreenBuilder({
              appId: application.id,
              configId: selectedWorkspace.configuration.id,
              screenId,
            })
          }
          onRemoveScreen={editor.removeScreen}
          onRenameScreen={editor.renameScreen}
          onReorderScreen={editor.reorderScreen}
          screens={draft.screens}
          unassignedScreens={editor.unassignedScreens}
        />
      </div>
    </section>
  );
}

function AppSaveStatus({ state }: { state: AppSaveState }) {
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
      {state.status === "saving" ? "Saving app..." : "App configuration saved."}
    </p>
  );
}
