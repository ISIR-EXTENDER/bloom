import type {
  ApplicationConfig,
  RuntimeActionPreset,
  RuntimeAdapterPolicy,
  ScreenConfig,
  UserProfile,
} from "@bloom/api-client";
import type { RosMessageCommandPreset } from "@bloom/widgets";
import { useEffect, useState } from "react";
import {
  addProfileToApplication,
  addScreenToApplication,
  createUniqueId,
  duplicateScreenInApplication,
  moveScreenBeforeInApplication,
  removeProfileFromApplication,
  removeScreenFromApplication,
  reorderScreenInApplication,
  updateProfileInApplication,
} from "../configurations/configuration-editor";
import { describeApiError } from "../ui/api-error";
import {
  ACCEPTED_MOODBOARD_IMAGE_TYPES,
  type AppSaveState,
  type AvailableScreen,
  createEmptyActionPresetDraft,
  createRuntimePresetFromLibraryPreset,
  createUniquePresetId,
  DEFAULT_THEME_INSPIRATION,
  MAX_MOODBOARD_IMAGE_BYTES,
  mergeUniqueRuntimePolicyValues,
  parseLines,
  type ThemeInspiration,
} from "./app-config-model";
import {
  type DeviceClass,
  defaultStopRegion,
  newScreenCanvasFor,
  resolveDeviceClass,
  resolveNewScreenCanvas,
} from "./builder-geometry";
import { createStarterProfile } from "./builder-starters";

type ApplicationDraftOptions = {
  application: ApplicationConfig;
  availableScreens: readonly AvailableScreen[];
  /** A draft the robot cannot run, such as one naming a frame it lacks, must not save. */
  canSave?: (draft: ApplicationConfig) => boolean;
  onSaveApplication: (application: ApplicationConfig) => Promise<void>;
  onUploadThemeAsset: (file: File) => Promise<string>;
};

/** The app under edit, every change an author can make to it, and the save that ships it. */
export function useApplicationDraft({
  application,
  availableScreens,
  canSave = () => true,
  onSaveApplication,
  onUploadThemeAsset,
}: ApplicationDraftOptions) {
  const [draft, setDraft] = useState(application);
  const [newPreset, setNewPreset] = useState(createEmptyActionPresetDraft());
  const [newScreenName, setNewScreenName] = useState("New screen");
  // Null follows the app: a desktop app's first screen makes new screens desktop ones.
  const [chosenScreenDevice, setNewScreenDevice] = useState<DeviceClass | null>(null);
  const newScreenDevice = chosenScreenDevice ?? resolveDeviceClass({ canvas: resolveNewScreenCanvas(draft) });
  const [saveState, setSaveState] = useState<AppSaveState>({ status: "idle" });
  const [themeInspirationError, setThemeInspirationError] = useState("");
  const isDirty = JSON.stringify(draft) !== JSON.stringify(application);
  const isSaving = saveState.status === "saving";
  const assignedScreenIds = new Set(draft.screens.map((screen) => screen.id));
  const unassignedScreens = availableScreens.filter(({ screen }) => !assignedScreenIds.has(screen.id));

  useEffect(() => {
    setDraft(application);
    setNewPreset(createEmptyActionPresetDraft());
    setSaveState({ status: "idle" });
    setThemeInspirationError("");
  }, [application]);

  const edit = (update: (current: ApplicationConfig) => ApplicationConfig) => {
    setDraft(update);
    setSaveState({ status: "idle" });
  };

  const saveDraft = async () => {
    if (!isDirty || isSaving || !canSave(draft)) {
      return;
    }

    setSaveState({ status: "saving" });
    try {
      await onSaveApplication(draft);
      setSaveState({ status: "saved" });
    } catch (error) {
      setSaveState({
        status: "error",
        message: describeApiError(error, "Bloom could not save this app configuration."),
      });
    }
  };

  const discard = () => {
    setDraft(application);
    setSaveState({ status: "idle" });
  };

  const patchApplication = (patch: Partial<ApplicationConfig>) => edit((current) => ({ ...current, ...patch }));

  const addScreen = (screen: ScreenConfig) => edit((current) => addScreenToApplication(current, screen));

  const renameScreen = (screenId: string, title: string) =>
    edit((current) => ({
      ...current,
      screens: current.screens.map((screen) => (screen.id === screenId ? { ...screen, title } : screen)),
    }));

  const addScreenById = (screenId: string) => {
    const availableScreen = unassignedScreens.find(({ screen }) => screen.id === screenId);
    if (availableScreen) {
      addScreen(availableScreen.screen);
    }
  };

  const addProfile = () =>
    edit((current) => {
      const name = `Role ${current.profiles.length + 1}`;
      // A new role opens on the screen the author is most likely to mean: the first one.
      const profile = {
        ...createStarterProfile(
          current.screens[0]?.id ?? "",
          current.theme.preset_id as "bloom-default" | "extender-ui" | "high-visibility",
        ),
        id: createUniqueId(
          name,
          current.profiles.map((candidate) => candidate.id),
        ),
        name,
      };
      return addProfileToApplication(current, profile);
    });

  const updateProfile = (profileId: string, patch: Partial<UserProfile>) =>
    edit((current) => updateProfileInApplication(current, profileId, patch));

  const removeProfile = (profileId: string) => edit((current) => removeProfileFromApplication(current, profileId));

  const createScreen = () => {
    const title = newScreenName.trim() || "New screen";
    const newScreenCanvas =
      chosenScreenDevice === null ? resolveNewScreenCanvas(draft) : newScreenCanvasFor(chosenScreenDevice);

    edit((current) =>
      addScreenToApplication(current, {
        id: createUniqueId(title, [
          ...availableScreens.map(({ screen }) => screen.id),
          ...current.screens.map((screen) => screen.id),
        ]),
        title,
        canvas: newScreenCanvas,
        // Every shipped operator screen reserves STOP's box, and a screen without one is not a screen
        // without STOP: the runtime falls back to floating it in a corner over whatever is underneath.
        reserved_regions: [defaultStopRegion(newScreenCanvas)],
        widgets: [],
      }),
    );
    setNewScreenName("New screen");
  };

  const duplicateScreen = (screenId: string) => edit((current) => duplicateScreenInApplication(current, screenId));

  const removeScreen = (screenId: string) => edit((current) => removeScreenFromApplication(current, screenId));

  const reorderScreen = (screenId: string, direction: "down" | "up") =>
    edit((current) => reorderScreenInApplication(current, screenId, direction));

  const moveScreenBefore = (screenId: string, targetScreenId: string) =>
    edit((current) => moveScreenBeforeInApplication(current, screenId, targetScreenId));

  const updateTheme = (theme: ApplicationConfig["theme"]) => patchApplication({ theme });

  const updateThemeInspiration = (nextInspiration: Partial<ThemeInspiration>) => {
    edit((current) => ({
      ...current,
      theme: {
        ...current.theme,
        inspiration: {
          ...(current.theme.inspiration ?? DEFAULT_THEME_INSPIRATION),
          ...nextInspiration,
        },
      },
    }));
    setThemeInspirationError("");
  };

  const updateRuntimePolicy = (patch: Partial<RuntimeAdapterPolicy>) =>
    edit((current) => ({ ...current, runtime_policy: { ...current.runtime_policy, ...patch } }));

  const updateRuntimePolicyList = (field: keyof RuntimeAdapterPolicy, value: string) =>
    updateRuntimePolicy({ [field]: parseLines(value) });

  const addActionPreset = () => {
    const name = newPreset.name.trim();
    if (!name) {
      return;
    }

    edit((current) => ({
      ...current,
      action_presets: [
        ...current.action_presets,
        {
          ...newPreset,
          command: newPreset.command.trim(),
          id: createUniquePresetId(name, current.action_presets),
          message_type: newPreset.message_type.trim(),
          name,
          payload_text: newPreset.payload_text.trim(),
          topic: newPreset.topic.trim(),
        },
      ],
    }));
    setNewPreset(createEmptyActionPresetDraft());
  };

  const removeActionPreset = (presetId: string) =>
    edit((current) => ({
      ...current,
      action_presets: current.action_presets.filter((preset) => preset.id !== presetId),
    }));

  const addLibraryActionPreset = (preset: RosMessageCommandPreset) =>
    edit((current) => ({
      ...current,
      action_presets: [...current.action_presets, createRuntimePresetFromLibraryPreset(preset, current.action_presets)],
    }));

  const syncRuntimePolicyFromActionPresets = () =>
    edit((current) => ({
      ...current,
      runtime_policy: {
        ...current.runtime_policy,
        allowed_message_types: mergeUniqueRuntimePolicyValues(
          current.runtime_policy.allowed_message_types,
          current.action_presets.map((preset) => preset.message_type),
        ),
        allowed_publish_topics: mergeUniqueRuntimePolicyValues(
          current.runtime_policy.allowed_publish_topics,
          current.action_presets.map((preset) => preset.topic),
        ),
      },
    }));

  const loadMoodboardFile = async (file: File | undefined) => {
    if (!file) {
      return;
    }

    if (!ACCEPTED_MOODBOARD_IMAGE_TYPES.has(file.type)) {
      setThemeInspirationError("Use a PNG, JPEG, or WebP image for the moodboard.");
      return;
    }

    if (file.size > MAX_MOODBOARD_IMAGE_BYTES) {
      setThemeInspirationError("Keep moodboard images under 1 MB for now. Asset upload will replace this later.");
      return;
    }

    try {
      updateThemeInspiration({ moodboard_image_uri: await onUploadThemeAsset(file) });
    } catch (error) {
      setThemeInspirationError(describeApiError(error, "Bloom could not save this app configuration."));
    }
  };

  return {
    addActionPreset,
    addLibraryActionPreset,
    addProfile,
    addScreen,
    addScreenById,
    createScreen,
    discard,
    draft,
    duplicateScreen,
    isDirty,
    isSaving,
    loadMoodboardFile,
    moveScreenBefore,
    newPreset,
    newScreenDevice,
    newScreenName,
    patchApplication,
    removeActionPreset,
    removeProfile,
    removeScreen,
    renameScreen,
    reorderScreen,
    saveDraft,
    saveState,
    setNewPreset: (patch: Partial<RuntimeActionPreset>) => setNewPreset((current) => ({ ...current, ...patch })),
    setNewScreenDevice,
    setNewScreenName,
    syncRuntimePolicyFromActionPresets,
    themeInspirationError,
    unassignedScreens,
    updateProfile,
    updateRuntimePolicy,
    updateRuntimePolicyList,
    updateTheme,
    updateThemeInspiration,
  };
}

export type ApplicationDraft = ReturnType<typeof useApplicationDraft>;
