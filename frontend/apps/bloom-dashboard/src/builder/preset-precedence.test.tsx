/**
 * @vitest-environment jsdom
 */
import type { RuntimeActionPreset, WidgetConfig } from "@bloom/api-client";
import { COMMAND_PURPOSES, createWidgetActionIntent } from "@bloom/widgets";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchRuntimeActionIntent, type RuntimeActionClient } from "../runtime/runtime-action-dispatcher";
import { BuilderWidgetSettingsEditor } from "./BuilderWidgetSettingsEditor";

const release: RuntimeActionPreset = {
  command: "behaviour/passthrough",
  description: "",
  id: "release-joint-target",
  kind: "topic-publish",
  message_type: "std_msgs/msg/String",
  name: "Release joint target",
  payload: {},
  payload_text: "{data: 'behaviour/passthrough'}",
  tags: [],
  topic: "/mode_request",
};

const purposeSettings = (id: string) => COMMAND_PURPOSES.find((purpose) => purpose.id === id)?.settings() ?? {};

const button = (settings: Record<string, unknown>) =>
  ({
    id: "neutral",
    kind: "command-button",
    layout: { height: 100, width: 200, x: 0, y: 0 },
    settings,
    title: "Neutral",
  }) as unknown as WidgetConfig;

function publishingClient() {
  const publishRosTopic = vi.fn(async (request: { message_type: string; topic: string }) => ({
    detail: "Published.",
    message_type: request.message_type,
    status: "published" as const,
    topic: request.topic,
  }));
  return { client: { publishRosTopic } as unknown as RuntimeActionClient, publishRosTopic };
}

/** Picks the preset in the inspector and returns the settings it saved. */
function pickPreset(settings: Record<string, unknown>, presetId: string): Record<string, unknown> {
  const onUpdateSettings = vi.fn((_settings: Record<string, unknown>) => null);
  render(
    <BuilderWidgetSettingsEditor
      actionPresets={[release]}
      onUpdateSettings={onUpdateSettings}
      onUpdateTitle={vi.fn()}
      widget={button(settings)}
    />,
  );
  fireEvent.change(screen.getByLabelText("Reusable preset"), { target: { value: presetId } });
  return onUpdateSettings.mock.lastCall?.[0] ?? {};
}

describe("a preset picked by name", () => {
  afterEach(cleanup);

  // Picking "Release joint target" on the Neutral button still sent geometric/both.
  it("is what the press sends once saved", async () => {
    const saved = pickPreset(purposeSettings("neutral"), release.id);
    expect(saved).toMatchObject({ presetId: release.id });
    expect(saved.topic).toBeUndefined();

    const { client, publishRosTopic } = publishingClient();
    const intent = createWidgetActionIntent(button(saved), { type: "press" });
    await dispatchRuntimeActionIntent(client, intent, { actionPresets: [release] });

    expect(publishRosTopic).toHaveBeenCalledOnce();
    expect(publishRosTopic.mock.calls[0]?.[0]).toMatchObject({
      payload_text: "{data: 'behaviour/passthrough'}",
      topic: "/mode_request",
    });
  });

  it("outranks a topic and a frame binding an older app still carries", async () => {
    const { client, publishRosTopic } = publishingClient();
    for (const settings of [
      { ...purposeSettings("go-home"), presetId: release.id },
      { ...purposeSettings("frame-tool"), presetId: release.id },
    ]) {
      await dispatchRuntimeActionIntent(client, createWidgetActionIntent(button(settings), { type: "press" }), {
        actionPresets: [release],
      });
    }

    expect(publishRosTopic).toHaveBeenCalledTimes(2);
    for (const [request] of publishRosTopic.mock.calls) {
      expect(request).toMatchObject({ payload_text: "{data: 'behaviour/passthrough'}" });
    }
  });

  it("falls back to the button's own topic when the app lacks that preset", async () => {
    const { client, publishRosTopic } = publishingClient();
    const intent = createWidgetActionIntent(button({ ...purposeSettings("go-home"), presetId: "gone" }), {
      type: "press",
    });
    await dispatchRuntimeActionIntent(client, intent, { actionPresets: [release] });

    expect(publishRosTopic.mock.calls[0]?.[0]).toMatchObject({ payload: { data: "behaviour/joint_target/home" } });
  });

  it("is cleared by picking a purpose", () => {
    const onUpdateSettings = vi.fn((_settings: Record<string, unknown>) => null);
    render(
      <BuilderWidgetSettingsEditor
        actionPresets={[release]}
        onUpdateSettings={onUpdateSettings}
        onUpdateTitle={vi.fn()}
        widget={button({ presetId: release.id })}
      />,
    );
    fireEvent.change(screen.getByLabelText("What this button does"), { target: { value: "jaco" } });
    expect(onUpdateSettings.mock.lastCall?.[0]).not.toHaveProperty("presetId");
  });

  it("warns when a saved button carries both a preset and its own topic", () => {
    render(
      <BuilderWidgetSettingsEditor
        actionPresets={[release]}
        onUpdateSettings={vi.fn(() => null)}
        onUpdateTitle={vi.fn()}
        widget={button({ ...purposeSettings("neutral"), presetId: release.id })}
      />,
    );
    expect(screen.getByText(/names preset "release-joint-target" and its own topic \/mode_request/)).toBeTruthy();
  });
});
