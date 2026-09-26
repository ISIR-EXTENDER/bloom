/**
 * @vitest-environment jsdom
 */
import type { ApplicationConfig } from "@bloom/api-client";
import { allowlistAllows, getRosMessageCommandPresetsByCategory, resolvePublishedMessageType } from "@bloom/widgets";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createDefaultWizardState, createGuidedApplication } from "./builder-starters";
import { useApplicationDraft } from "./use-application-draft";
import { collectPublishRoutes } from "./widget-publish-route";

const snakePreset = Array.from(getRosMessageCommandPresetsByCategory())
  .flatMap(([, presets]) => presets)
  .find((preset) => preset.id === "manager-snake");

function renderDraft(
  application: ApplicationConfig,
  onSaveApplication: (application: ApplicationConfig) => Promise<void> = vi.fn(async () => undefined),
) {
  return renderHook(
    ({ app }) =>
      useApplicationDraft({ application: app, availableScreens: [], onSaveApplication, onUploadThemeAsset: vi.fn() }),
    { initialProps: { app: application } },
  );
}

describe("Sync publish guardrails", () => {
  // A guided app, the snake preset and Sync made publish ["/mode_request"]: the speed slider and gripper were refused.
  it("never narrows an open list to one that refuses a widget already on a screen", () => {
    if (!snakePreset) throw new Error("the library has no Manager snake preset");
    const guided = createGuidedApplication(createDefaultWizardState([]), [], "explorer");
    const { result } = renderDraft(guided);

    act(() => result.current.addLibraryActionPreset(snakePreset));
    act(() => result.current.syncRuntimePolicyFromActionPresets());

    const { allowed_message_types: types, allowed_publish_topics: topics } = result.current.draft.runtime_policy;
    const routes = collectPublishRoutes(result.current.draft);
    expect(routes.length).toBeGreaterThan(0);
    for (const route of routes) {
      expect(topics.length === 0 || allowlistAllows(topics, route.topic)).toBe(true);
      expect(types.length === 0 || allowlistAllows(types, route.messageType ?? "")).toBe(true);
    }
    expect(topics).toContain("/mode_request");
  });

  it("adds the topics and types the app's own screens publish to a list that already names some", () => {
    const guided = createGuidedApplication(createDefaultWizardState([]), [], "explorer");
    const { result } = renderDraft({
      ...guided,
      runtime_policy: { ...guided.runtime_policy, allowed_message_types: ["x/msg/Y"], allowed_publish_topics: ["/x"] },
    });

    act(() => result.current.syncRuntimePolicyFromActionPresets());

    const slider = guided.screens[0]?.widgets.find((widget) => widget.kind === "slider");
    expect(result.current.draft.runtime_policy.allowed_publish_topics).toContain(slider?.settings.topic);
    expect(result.current.draft.runtime_policy.allowed_message_types).toContain(
      resolvePublishedMessageType("slider", slider?.settings),
    );
  });
});

describe("the app draft", () => {
  // The store delivering the saved app reverted what the author typed while the save was in flight.
  it("keeps typing done during a save when the saved app arrives", async () => {
    const guided = createGuidedApplication(createDefaultWizardState([]), []);
    let finishSave: (value?: undefined) => void = () => undefined;
    const onSaveApplication = vi.fn(
      (_application: ApplicationConfig) => new Promise<void>((resolve) => (finishSave = resolve)),
    );
    const { rerender, result } = renderDraft(guided, onSaveApplication);

    act(() => result.current.patchApplication({ name: "Sent" }));
    let saving = Promise.resolve();
    act(() => {
      saving = result.current.saveDraft();
    });
    const sent = onSaveApplication.mock.calls[0]?.[0] as unknown as ApplicationConfig;
    act(() => result.current.patchApplication({ name: "Typed after" }));

    rerender({ app: structuredClone(sent) });
    await act(async () => {
      finishSave();
      await saving;
    });

    expect(result.current.draft.name).toBe("Typed after");
    expect(result.current.isDirty).toBe(true);
  });

  it("adopts the saved app when nothing was typed since", () => {
    const guided = createGuidedApplication(createDefaultWizardState([]), []);
    const { rerender, result } = renderDraft(guided);
    act(() => result.current.patchApplication({ name: "Sent" }));
    act(() => {
      void result.current.saveDraft();
    });

    rerender({ app: { ...guided, name: "Sent" } });

    expect(result.current.isDirty).toBe(false);
  });
});
