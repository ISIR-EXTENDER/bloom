/**
 * @vitest-environment jsdom
 */
import { type ApplicationConfig, BloomApiError, type ScreenConfig } from "@bloom/api-client";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createDefaultWizardState, createGuidedApplication } from "./builder-starters";
import { useApplicationDraft } from "./use-application-draft";

type Options = {
  app?: ApplicationConfig;
  availableScreens?: { screen: ScreenConfig; sourceApplicationId: string }[];
  canSave?: (draft: ApplicationConfig) => boolean;
  save?: (application: ApplicationConfig) => Promise<void>;
  upload?: (file: File) => Promise<string>;
};

function guided(id = "ops") {
  return { ...createGuidedApplication(createDefaultWizardState([]), [], "explorer"), id };
}

function draftOf(options: Options = {}) {
  const saved: ApplicationConfig[] = [];
  const hook = renderHook(
    ({ app }) =>
      useApplicationDraft({
        application: app,
        availableScreens: (options.availableScreens ?? []) as never,
        canSave: options.canSave,
        onSaveApplication:
          options.save ??
          (async (application) => {
            saved.push(application);
          }),
        onUploadThemeAsset: options.upload ?? (async (file) => `bloom-asset://theme/${file.name}`),
      }),
    { initialProps: { app: options.app ?? guided() } },
  );
  return { ...hook, saved };
}

describe("saving a draft", () => {
  it("goes idle, dirty, saving, saved; and is a no-op while clean or refused", async () => {
    const { result, saved } = draftOf({ canSave: (draft) => draft.name !== "refused" });
    expect(result.current.isDirty).toBe(false);
    await act(() => result.current.saveDraft());
    expect(saved).toEqual([]);

    act(() => result.current.patchApplication({ name: "Renamed" }));
    expect(result.current.isDirty).toBe(true);
    await act(() => result.current.saveDraft());
    expect(saved.map((application) => application.name)).toEqual(["Renamed"]);
    expect(result.current.saveState).toEqual({ status: "saved" });

    act(() => result.current.patchApplication({ name: "refused" }));
    await act(() => result.current.saveDraft());
    expect(saved).toHaveLength(1);
  });

  it("keeps the backend's reason when a save fails, and drops the typing on discard", async () => {
    const { result } = draftOf({
      save: async () => {
        throw new BloomApiError("Conflict", 409, JSON.stringify({ detail: "Someone else saved first." }));
      },
    });
    act(() => result.current.patchApplication({ name: "Mine" }));
    await act(() => result.current.saveDraft());
    expect(result.current.saveState).toEqual({ status: "error", message: "Conflict Someone else saved first." });
    act(() => result.current.discard());
    expect(result.current.isDirty).toBe(false);
    expect(result.current.saveState).toEqual({ status: "idle" });
  });

  it("starts over when another app is opened, even with unsaved typing", () => {
    const { result, rerender } = draftOf();
    act(() => result.current.patchApplication({ name: "Typed" }));
    act(() => result.current.setNewPreset({ name: "Half typed" }));
    rerender({ app: guided("other") });
    expect(result.current.draft.id).toBe("other");
    expect(result.current.isDirty).toBe(false);
    expect(result.current.newPreset.name).toBe("");
  });
});

describe("screens in a draft", () => {
  it("creates a screen with a unique id, a STOP region and the app's device, then renames, copies, reorders and removes it", () => {
    const taken = { screen: { id: "new-screen", title: "Taken" } as ScreenConfig, sourceApplicationId: "other" };
    const { result } = draftOf({ availableScreens: [taken] });
    const before = result.current.draft.screens.length;
    act(() => result.current.setNewScreenName("  "));
    act(() => result.current.createScreen());
    const created = result.current.draft.screens.at(-1) as ScreenConfig;
    expect(created.title).toBe("New screen");
    expect(created.id).not.toBe("new-screen");
    expect(created.reserved_regions).toHaveLength(1);
    expect(result.current.newScreenName).toBe("New screen");
    expect(result.current.draft.screens).toHaveLength(before + 1);

    act(() => result.current.renameScreen(created.id, "Arm"));
    expect(result.current.draft.screens.at(-1)?.title).toBe("Arm");

    act(() => result.current.duplicateScreen(created.id));
    expect(result.current.draft.screens).toHaveLength(before + 2);

    act(() => result.current.reorderScreen(created.id, "up"));
    expect(result.current.draft.screens[before - 1]?.id).toBe(created.id);
    const first = result.current.draft.screens[0] as ScreenConfig;
    act(() => result.current.moveScreenBefore(created.id, first.id));
    expect(result.current.draft.screens[0]?.id).toBe(created.id);

    act(() => result.current.removeScreen(created.id));
    expect(result.current.draft.screens.some((screen) => screen.id === created.id)).toBe(false);
  });

  it("makes a desktop screen when the author picks a desktop, and follows the tablet app otherwise", () => {
    const { result } = draftOf();
    expect(result.current.newScreenDevice).toBe("tablet");
    act(() => result.current.setNewScreenDevice("desktop"));
    expect(result.current.newScreenDevice).toBe("desktop");
    act(() => result.current.createScreen());
    const desktop = result.current.draft.screens.at(-1) as ScreenConfig;
    expect(desktop.canvas.preset_id).not.toBe(result.current.draft.screens[0]?.canvas.preset_id);
    act(() => result.current.setNewScreenDevice(null));
    expect(result.current.newScreenDevice).toBe("tablet");
    act(() => result.current.createScreen());
    expect(result.current.draft.screens.at(-1)?.canvas.preset_id).toBe(
      result.current.draft.screens[0]?.canvas.preset_id,
    );
  });

  it("adds a screen from another app once, and ignores an id it does not offer", () => {
    const shared = {
      screen: {
        id: "shared",
        title: "Shared",
        canvas: { preset_id: "hd", runtime_mode: "fit" },
        widgets: [],
      } as unknown as ScreenConfig,
      sourceApplicationId: "other",
    };
    const { result } = draftOf({ availableScreens: [shared] });
    expect(result.current.unassignedScreens.map(({ screen }) => screen.id)).toEqual(["shared"]);
    act(() => result.current.addScreenById("nope"));
    expect(result.current.isDirty).toBe(false);
    act(() => result.current.addScreenById("shared"));
    expect(result.current.draft.screens.at(-1)?.id).toBe("shared");
    expect(result.current.unassignedScreens).toEqual([]);
  });
});

describe("roles, theme, policy and presets in a draft", () => {
  it("adds a role on the first screen under a fresh id, updates it and removes it", () => {
    const { result } = draftOf();
    const before = result.current.draft.profiles.length;
    act(() => result.current.addProfile());
    act(() => result.current.addProfile());
    const added = result.current.draft.profiles.slice(before);
    expect(added).toHaveLength(2);
    expect(new Set(added.map((profile) => profile.id)).size).toBe(2);
    expect(added[0]?.preferred_control_layout_id).toBe(result.current.draft.screens[0]?.id);
    const id = added[0]?.id as string;
    act(() => result.current.updateProfile(id, { name: "Carer" }));
    expect(result.current.draft.profiles.find((profile) => profile.id === id)?.name).toBe("Carer");
    act(() => result.current.removeProfile(id));
    expect(result.current.draft.profiles.some((profile) => profile.id === id)).toBe(false);
  });

  it("reads a policy list one entry per line, ignoring blanks", () => {
    const { result } = draftOf();
    act(() => result.current.updateRuntimePolicyList("allowed_publish_topics", " /mode_request \n\n/teleop_cmd\n"));
    expect(result.current.draft.runtime_policy.allowed_publish_topics).toEqual(["/mode_request", "/teleop_cmd"]);
  });

  it("adds a typed preset with trimmed ROS names and a unique id, edits it, and removes it", () => {
    const { result } = draftOf();
    act(() => result.current.addActionPreset());
    const untouched = result.current.draft.action_presets.length;
    act(() =>
      result.current.setNewPreset({
        name: "Open",
        topic: " /gripper ",
        message_type: " std_msgs/msg/Bool ",
        payload_text: " {data: true} ",
      }),
    );
    act(() => result.current.addActionPreset());
    act(() => result.current.setNewPreset({ name: "Open", topic: "/gripper" }));
    act(() => result.current.addActionPreset());
    const presets = result.current.draft.action_presets.slice(untouched);
    expect(presets).toHaveLength(2);
    expect(presets[0]).toMatchObject({
      name: "Open",
      topic: "/gripper",
      message_type: "std_msgs/msg/Bool",
      payload_text: "{data: true}",
    });
    expect(presets[0]?.id).not.toBe(presets[1]?.id);
    expect(result.current.newPreset.name).toBe("");

    const id = presets[0]?.id as string;
    act(() => result.current.updateActionPreset(id, { topic: " /gripper/open ", name: " Open wide " }));
    expect(result.current.draft.action_presets.find((preset) => preset.id === id)).toMatchObject({
      name: " Open wide ",
      topic: "/gripper/open",
    });
    act(() => result.current.removeActionPreset(id));
    expect(result.current.draft.action_presets.some((preset) => preset.id === id)).toBe(false);
  });

  it("takes only a small PNG, JPEG or WebP as a moodboard and keeps the upload's URI, or the upload's reason", async () => {
    const { result } = draftOf({
      upload: async (file) => {
        if (file.name === "denied.png")
          throw new BloomApiError("Forbidden", 403, JSON.stringify({ detail: "Read-only configuration." }));
        return `bloom-asset://theme/${file.name}`;
      },
    });
    await act(() => result.current.loadMoodboardFile(undefined));
    expect(result.current.themeInspirationError).toBe("");
    await act(() => result.current.loadMoodboardFile(new File(["x"], "board.gif", { type: "image/gif" })));
    expect(result.current.themeInspirationError).toBe("Use a PNG, JPEG, or WebP image for the moodboard.");
    await act(() =>
      result.current.loadMoodboardFile(new File([new Uint8Array(1_100_000)], "big.png", { type: "image/png" })),
    );
    expect(result.current.themeInspirationError).toMatch(/under 1 MB/);
    await act(() => result.current.loadMoodboardFile(new File(["x"], "denied.png", { type: "image/png" })));
    expect(result.current.themeInspirationError).toBe("Forbidden Read-only configuration.");
    await act(() => result.current.loadMoodboardFile(new File(["x"], "board.webp", { type: "image/webp" })));
    expect(result.current.themeInspirationError).toBe("");
    expect(result.current.draft.theme.inspiration?.moodboard_image_uri).toBe("bloom-asset://theme/board.webp");
    act(() => result.current.updateTheme({ ...result.current.draft.theme, preset_id: "night" } as never));
    expect((result.current.draft.theme as { preset_id?: string }).preset_id).toBe("night");
  });
});
