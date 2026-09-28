/**
 * @vitest-environment jsdom
 */
import type { RuntimeActionPreset, WidgetConfig } from "@bloom/api-client";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyActionPresetDraft } from "./app-config-model";
import { BuilderActionPresetsPanel } from "./BuilderActionPresetsPanel";
import { BuilderWidgetSettingsEditor } from "./BuilderWidgetSettingsEditor";
import { createDefaultWizardState, createGuidedApplication } from "./builder-starters";
import { useApplicationDraft } from "./use-application-draft";
import { describePresetTypeProblem, describeWidgetSendProblems } from "./widget-send-problems";

afterEach(cleanup);

const gripper: RuntimeActionPreset = {
  command: "gripper.enable",
  description: "",
  id: "gripper-enable",
  kind: "service-call",
  message_type: "std_srvs/srv/SetBool",
  name: "Enable gripper",
  payload: null,
  payload_text: "{data: true}",
  tags: [],
  topic: "/gripper/enable",
};

const button = (preset: RuntimeActionPreset) =>
  ({
    id: "button",
    kind: "command-button",
    layout: { height: 100, width: 200, x: 0, y: 0 },
    settings: { command: preset.command, presetId: preset.id },
    title: "Button",
  }) as unknown as WidgetConfig;

function renderPanel(props: Partial<Parameters<typeof BuilderActionPresetsPanel>[0]> = {}) {
  const handlers = { onNewPresetChange: vi.fn(), onUpdatePreset: vi.fn() };
  render(
    <BuilderActionPresetsPanel
      newPreset={createEmptyActionPresetDraft()}
      onAddLibraryPreset={vi.fn()}
      onAddPreset={vi.fn()}
      onRemovePreset={vi.fn()}
      presets={[]}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

describe("the preset form", () => {
  it("defaults to a topic publish and switches kind", () => {
    const { onNewPresetChange } = renderPanel();
    expect(screen.getByLabelText("Topic")).toBeTruthy();
    expect(screen.getByLabelText("Message type")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Preset kind"), { target: { value: "service-call" } });
    expect(onNewPresetChange).toHaveBeenCalledWith({ kind: "service-call" });
  });

  it("names the service, its type and its request fields for a service call", () => {
    renderPanel({ newPreset: { ...createEmptyActionPresetDraft(), kind: "service-call" } });
    expect(screen.queryByLabelText("Topic")).toBeNull();
    expect(screen.getByLabelText("Service").getAttribute("placeholder")).toBe("/gripper/enable");
    expect(screen.getByLabelText("Service type").getAttribute("placeholder")).toBe("std_srvs/srv/SetBool");
    expect(screen.getByLabelText("Request fields (YAML)")).toBeTruthy();
    expect(screen.getByText(/Leave it empty for a service whose request has no fields/)).toBeTruthy();
  });

  it("warns when the service type is a message type, and a publish type is a service type", () => {
    renderPanel({
      newPreset: { ...createEmptyActionPresetDraft(), kind: "service-call", message_type: "std_msgs/msg/Bool" },
    });
    expect(screen.getByRole("alert").textContent).toContain("std_msgs/msg/Bool is not a service type");
    expect(describePresetTypeProblem({ kind: "topic-publish", message_type: "std_srvs/srv/Trigger" })).toContain(
      "Pick Service call",
    );
    expect(describePresetTypeProblem(gripper)).toBeNull();
    expect(describePresetTypeProblem({ kind: "service-call", message_type: "" })).toBeNull();
  });
});

describe("an existing preset", () => {
  it("can change its kind, fields and request fields", () => {
    const topicPreset = { ...gripper, kind: "topic-publish", payload: { data: true }, payload_text: "" };
    const { onUpdatePreset } = renderPanel({ presets: [topicPreset] });
    expect((screen.getByLabelText("Payload of gripper-enable") as HTMLTextAreaElement).value).toBe('{"data":true}');

    fireEvent.change(screen.getByLabelText("Preset kind of gripper-enable"), { target: { value: "service-call" } });
    expect(onUpdatePreset).toHaveBeenCalledWith("gripper-enable", { kind: "service-call" });
    fireEvent.change(screen.getByLabelText("Topic of gripper-enable"), { target: { value: "/gripper/open" } });
    expect(onUpdatePreset).toHaveBeenCalledWith("gripper-enable", { topic: "/gripper/open" });
    fireEvent.change(screen.getByLabelText("Payload of gripper-enable"), { target: { value: "{data: false}" } });
    expect(onUpdatePreset).toHaveBeenCalledWith("gripper-enable", { payload: null, payload_text: "{data: false}" });
  });

  it("is updated in the draft by id, with ROS names trimmed", () => {
    const guided = createGuidedApplication(createDefaultWizardState([]), [], "explorer");
    const { result } = renderHook(() =>
      useApplicationDraft({
        application: { ...guided, action_presets: [gripper] },
        availableScreens: [],
        onSaveApplication: vi.fn(async () => undefined),
        onUploadThemeAsset: vi.fn(),
      }),
    );
    act(() => result.current.updateActionPreset("gripper-enable", { message_type: " std_srvs/srv/Trigger " }));
    act(() => result.current.updateActionPreset("gripper-enable", { name: "Enable gripper " }));
    expect(result.current.draft.action_presets[0]).toMatchObject({
      message_type: "std_srvs/srv/Trigger",
      name: "Enable gripper ",
    });
  });
});

describe("a button sending a service-call preset", () => {
  it("is flagged when the preset names no service or type, or a message type", () => {
    expect(describeWidgetSendProblems(button(gripper), [gripper])).toEqual([]);
    const untyped = { ...gripper, message_type: "", topic: "" };
    expect(describeWidgetSendProblems(button(untyped), [untyped])[0]).toContain("names no service and no service type");
    const msgType = { ...gripper, message_type: "std_msgs/msg/Bool" };
    expect(describeWidgetSendProblems(button(msgType), [msgType])[0]).toContain("is not a service type");
  });

  function renderInspector(serviceTypes: string[], serviceCalls?: string[]) {
    const onAllowPolicyEntry = vi.fn();
    render(
      <BuilderWidgetSettingsEditor
        actionPresets={[gripper]}
        allowedServiceCalls={[]}
        deploymentAllowlists={{ serviceCalls, serviceTypes }}
        onAllowPolicyEntry={onAllowPolicyEntry}
        onUpdateSettings={vi.fn(() => null)}
        onUpdateTitle={vi.fn()}
        widget={button(gripper)}
      />,
    );
    return onAllowPolicyEntry;
  }

  it("offers Allow for the app's service list when the deployment takes the type", () => {
    const onAllow = renderInspector(["std_srvs/srv/SetBool"]);
    expect(screen.getByText(/This app does not allow calling \/gripper\/enable/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Allow /gripper/enable in this app" }));
    expect(onAllow).toHaveBeenCalledWith("allowed_service_calls", "/gripper/enable");
  });

  it("offers no Allow when the deployment refuses the type or the service", () => {
    renderInspector(["std_srvs/srv/Trigger"]);
    expect(screen.getByText(/This robot refuses the service type std_srvs\/srv\/SetBool/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Allow \/gripper\/enable/ })).toBeNull();
    cleanup();
    renderInspector(["std_srvs/srv/SetBool"], ["/other/service"]);
    expect(screen.queryByRole("button", { name: /Allow \/gripper\/enable/ })).toBeNull();
  });
});
