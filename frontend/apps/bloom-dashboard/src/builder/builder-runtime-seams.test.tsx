/**
 * @vitest-environment jsdom
 */
import type { ApplicationConfig, RuntimeActionPreset, ScreenConfig, WidgetConfig } from "@bloom/api-client";
import { COMMAND_PURPOSES, createWidgetActionIntent } from "@bloom/widgets";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchRuntimeActionIntent, type RuntimeActionClient } from "../runtime/runtime-action-dispatcher";
import { evaluateBuilderTour } from "./BuilderGuidedTour";
import { BuilderWidgetSettingsEditor } from "./BuilderWidgetSettingsEditor";
import { BuilderWorkspace } from "./BuilderWorkspace";
import { describeSpeedCapExcess } from "./speed-limit-caps";
import { resolveWidgetRoute, syncPublishPolicy } from "./widget-publish-route";

const preset = (overrides: Partial<RuntimeActionPreset>): RuntimeActionPreset => ({
  command: "behaviour/passthrough",
  description: "",
  id: "release",
  kind: "topic-publish",
  message_type: "std_msgs/msg/String",
  name: "Release joint target",
  payload: { data: "behaviour/passthrough" },
  payload_text: "",
  tags: [],
  topic: "/mode_request",
  ...overrides,
});
const release = preset({});
const home = preset({
  command: "behaviour/joint_target/home",
  id: "home",
  name: "Home",
  payload: { data: "behaviour/joint_target/home" },
});
const faultReset = preset({
  command: "kinova.reset_fault",
  id: "fault-reset",
  kind: "service-call",
  message_type: "example_interfaces/srv/Trigger",
  name: "Reset fault",
  payload: null,
  topic: "/fault_controller/reset_fault",
});

const purposeSettings = (id: string) => COMMAND_PURPOSES.find((purpose) => purpose.id === id)?.settings() ?? {};

const button = (settings: Record<string, unknown>, id = "button") =>
  ({
    id,
    kind: "command-button",
    layout: { height: 100, width: 200, x: 0, y: 0 },
    settings,
    title: "Button",
  }) as unknown as WidgetConfig;

function renderEditor(widget: WidgetConfig, props: Partial<Parameters<typeof BuilderWidgetSettingsEditor>[0]> = {}) {
  const onUpdateSettings = vi.fn((_settings: Record<string, unknown>) => null);
  render(
    <BuilderWidgetSettingsEditor
      actionPresets={[release, home, faultReset]}
      onUpdateSettings={onUpdateSettings}
      onUpdateTitle={vi.fn()}
      widget={widget}
      {...props}
    />,
  );
  return { lastSaved: () => onUpdateSettings.mock.lastCall?.[0] ?? {}, onUpdateSettings };
}

function publishingClient() {
  const publishRosTopic = vi.fn(async (request: { message_type: string; topic: string }) => ({
    detail: "Published.",
    message_type: request.message_type,
    status: "published" as const,
    topic: request.topic,
  }));
  const dispatchRuntimeAction = vi.fn(async () => ({ detail: "Called.", status: "published" as const }));
  return {
    client: { dispatchRuntimeAction, publishRosTopic } as unknown as RuntimeActionClient,
    dispatchRuntimeAction,
    publishRosTopic,
  };
}

const appWith = (widgets: WidgetConfig[], presets: RuntimeActionPreset[], policy: Record<string, string[]> = {}) =>
  ({
    action_presets: presets,
    id: "app",
    name: "App",
    profiles: [],
    runtime_policy: {
      allowed_message_types: [],
      allowed_publish_topics: [],
      allowed_recording_topics: [],
      allowed_service_calls: [],
      allowed_teleop_targets: [],
      ...policy,
    },
    screens: [
      { canvas: { preset_id: "native-1280x720", runtime_mode: "fit" }, id: "screen", title: "Screen", widgets },
    ],
  }) as unknown as ApplicationConfig;

afterEach(cleanup);

describe("a preset on a Hold to run button", () => {
  it("cannot be held: Hold to run is off and disabled once a preset is picked", () => {
    const { lastSaved } = renderEditor(button(purposeSettings("snake-hold")));
    fireEvent.change(screen.getByLabelText("Reusable preset"), { target: { value: release.id } });
    expect(lastSaved().momentary).toBeUndefined();
    cleanup();

    renderEditor(button({ command: release.command, presetId: release.id }));
    const hold = screen.getByRole("checkbox", { name: /Hold to run/ }) as HTMLInputElement;
    expect(hold.disabled).toBe(true);
    expect(screen.getByText(/cannot be held/)).toBeTruthy();
  });

  it("warns on an older app that saved both", () => {
    renderEditor(button({ command: release.command, momentary: true, presetId: release.id }));
    expect(screen.getByText(/names preset "release" and Hold to run/)).toBeTruthy();
  });
});

describe("clearing a picked preset", () => {
  it("stops sending it and the inspector agrees", async () => {
    const { lastSaved } = renderEditor(button({ command: release.command, presetId: release.id }));
    fireEvent.change(screen.getByLabelText("Reusable preset"), { target: { value: "" } });
    const saved = lastSaved();
    expect(saved.presetId).toBeUndefined();
    expect(saved.command).toBeUndefined();

    const { client, dispatchRuntimeAction, publishRosTopic } = publishingClient();
    await dispatchRuntimeActionIntent(client, createWidgetActionIntent(button(saved), { type: "press" }), {
      actionPresets: [release],
      appId: "app",
      configId: "config",
    });
    expect(publishRosTopic).not.toHaveBeenCalled();
    expect(dispatchRuntimeAction).not.toHaveBeenCalled();
    expect(resolveWidgetRoute(button(saved), [release])?.destination.topic ?? null).toBeNull();
  });

  it("names the preset the dispatcher matches by command, as the dispatcher sends it", async () => {
    const legacy = button({ command: release.command });
    expect(resolveWidgetRoute(legacy, [release])?.destination.topic).toBe("/mode_request");

    const { client, publishRosTopic } = publishingClient();
    await dispatchRuntimeActionIntent(client, createWidgetActionIntent(legacy, { type: "press" }), {
      actionPresets: [release],
    });
    expect(publishRosTopic.mock.calls[0]?.[0]).toMatchObject({ topic: "/mode_request" });
  });
});

describe("picking a preset", () => {
  it("keeps the press-twice guard and the danger styling", async () => {
    const { lastSaved } = renderEditor(button({ ...purposeSettings("go-home"), variant: "danger" }));
    fireEvent.change(screen.getByLabelText("Reusable preset"), { target: { value: release.id } });
    expect(lastSaved()).toMatchObject({
      confirm_label: "Press again to move",
      confirm_press: true,
      confirm_timeout_seconds: 5,
      presetId: release.id,
      variant: "danger",
    });
    expect(lastSaved().topic).toBeUndefined();
  });

  it("turns the guard on for a joint target", () => {
    const { lastSaved } = renderEditor(button(purposeSettings("neutral")));
    fireEvent.change(screen.getByLabelText("Reusable preset"), { target: { value: home.id } });
    expect(lastSaved()).toMatchObject({ confirm_press: true, presetId: home.id });
  });
});

describe("a service-call preset", () => {
  const reset = button({ command: faultReset.command, presetId: faultReset.id });

  it("is checked against the service list, never the publish lists", () => {
    const route = resolveWidgetRoute(reset, [faultReset]);
    expect(route).toMatchObject({ messageType: null, service: "/fault_controller/reset_fault" });

    const app = appWith([reset], [faultReset], { allowed_publish_topics: ["/mode_request"] });
    const synced = syncPublishPolicy(app);
    expect(synced.allowed_publish_topics).toEqual(["/mode_request"]);
    expect(synced.allowed_message_types).toEqual([]);
    expect(synced.allowed_service_calls).toEqual(["/fault_controller/reset_fault"]);

    expect(evaluateBuilderTour(app).topics).toBe(false);
    expect(
      evaluateBuilderTour(appWith([reset], [faultReset], { allowed_service_calls: synced.allowed_service_calls }))
        .topics,
    ).toBe(true);
  });

  it("offers the service list's Allow in the inspector", () => {
    const onAllowPolicyEntry = vi.fn();
    renderEditor(reset, { allowedServiceCalls: [], onAllowPolicyEntry });
    expect(screen.getByText("Calls service")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Allow /fault_controller/reset_fault in this app" }));
    expect(onAllowPolicyEntry).toHaveBeenCalledWith("allowed_service_calls", "/fault_controller/reset_fault");
  });
});

type SeedBundle = { applications?: ApplicationConfig[] };
const seeds = Object.entries(
  import.meta.glob<SeedBundle>("../../../../../backend/seed/applications/*.json", { eager: true, import: "default" }),
);

// An app with nothing bound to ROS (the webcam visualizer) has no topics step to pass.
const bindsRos = (application: ApplicationConfig) =>
  application.screens.some((screen) =>
    screen.widgets.some((widget) => resolveWidgetRoute(widget, application.action_presets) !== null),
  );

describe("every shipped seed", () => {
  it.each(seeds)("%s passes the checklist's topics step", (_path, bundle) => {
    for (const application of (bundle.applications ?? []).filter(bindsRos)) {
      expect({ app: application.id, topics: evaluateBuilderTour(application).topics }).toEqual({
        app: application.id,
        topics: true,
      });
    }
  });
});

describe("an Allow the deployment refuses", () => {
  it("says the lab must allow it and offers no Allow", () => {
    const onAllowPolicyEntry = vi.fn();
    renderEditor(
      button({ command: "x", messageType: "std_msgs/msg/String", payload: { data: "x" }, topic: "/other" }),
      {
        allowedPublishTopics: ["/mode_request"],
        deploymentAllowlists: { messageTypes: ["std_msgs/msg/String"], publishTopics: ["/mode_request", "/ui/"] },
        onAllowPolicyEntry,
      },
    );
    expect(screen.getByRole("alert").textContent).toMatch(
      /this robot refuses it too; the lab's deployment settings must allow it/,
    );
    expect(screen.queryByRole("button", { name: /^Allow / })).toBeNull();
  });

  it("still offers Allow for what the deployment grants, namespaces included", () => {
    renderEditor(button({ command: "x", messageType: "std_msgs/msg/String", payload: { data: "x" }, topic: "/ui/x" }), {
      allowedPublishTopics: ["/mode_request"],
      deploymentAllowlists: { messageTypes: ["std_msgs/msg/String"], publishTopics: ["/ui/"] },
      onAllowPolicyEntry: vi.fn(),
    });
    expect(screen.getByRole("button", { name: "Allow /ui/x in this app" })).toBeTruthy();
  });
});

describe("two Allow clicks before the first save lands", () => {
  it("keeps both entries", async () => {
    const widget = {
      ...button({ command: "x", messageType: "std_msgs/msg/Int32", payload: { data: 1 }, topic: "/other" }, "other"),
      layout: { height: 120, width: 320, x: 40, y: 40 },
      title: "Other",
    } as WidgetConfig;
    const source = {
      canvas: { preset_id: "native-1280x720", runtime_mode: "fit" },
      id: "screen",
      title: "Screen",
      widgets: [widget],
    } as unknown as ScreenConfig;
    const application = {
      ...appWith([widget], [], {
        allowed_message_types: ["std_msgs/msg/String"],
        allowed_publish_topics: ["/mode_request"],
      }),
      screens: [source],
    };
    let finishFirst = () => {};
    const onSaveApplication = vi
      .fn(async (_application: ApplicationConfig) => undefined)
      .mockImplementationOnce(() => new Promise<undefined>((resolve) => (finishFirst = () => resolve(undefined))));
    render(
      <BuilderWorkspace
        configurations={[{ bundle: { applications: [application], metadata: {} }, id: "config" } as never]}
        onBackToAppConfig={vi.fn()}
        onBackToBuilderHome={vi.fn()}
        onSaveApplication={onSaveApplication}
        onSaveScreenDraft={vi.fn()}
        runtimeCapabilities={null}
        selection={{ appId: application.id, configId: "config", screenId: source.id }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Select and move Other widget" }));
    fireEvent.click(screen.getByRole("button", { name: "Allow /other in this app" }));
    fireEvent.click(screen.getByRole("button", { name: "Allow std_msgs/msg/Int32 in this app" }));
    await vi.waitFor(() => expect(onSaveApplication).toHaveBeenCalledOnce());
    await act(async () => finishFirst());
    await vi.waitFor(() => expect(onSaveApplication).toHaveBeenCalledTimes(2));

    expect(onSaveApplication.mock.calls[1]?.[0].runtime_policy).toMatchObject({
      allowed_message_types: ["std_msgs/msg/String", "std_msgs/msg/Int32"],
      allowed_publish_topics: ["/mode_request", "/other"],
    });
  });
});

describe("Hold to run on /mode_request", () => {
  it("lets go to Neutral when ticked without a release payload, and warns when one is missing", () => {
    const { lastSaved } = renderEditor(button(purposeSettings("jaco")), { actionPresets: [] });
    fireEvent.click(screen.getByRole("checkbox", { name: /Hold to run/ }));
    expect(lastSaved()).toMatchObject({ momentary: true, releasedPayload: { data: "geometric/both" } });
    cleanup();

    renderEditor(button({ ...purposeSettings("jaco"), momentary: true }), { actionPresets: [] });
    expect(screen.getByText(/sends nothing on release/)).toBeTruthy();
  });
});

describe("a speed-limit slider", () => {
  const destination = {
    detail: null,
    direction: "publishes" as const,
    inertSettings: [],
    source: "output-topic" as const,
    topic: "/explorer_user_interfaces/rqt_armcontrol/max_linear_speed",
  };
  const caps = { angular: 0.8, linear: 0.3 };

  it("says nothing of a segment the maximum already clamps", () => {
    expect(
      describeSpeedCapExcess("slider", destination, { max: 0.3, min: 0, segment_values: [0.1, 0.5] }, caps),
    ).toBeNull();
  });

  it("warns about a negative minimum", () => {
    expect(describeSpeedCapExcess("slider", destination, { max: 0.3, min: -0.1 }, caps)).toMatch(/negative/);
  });
});
