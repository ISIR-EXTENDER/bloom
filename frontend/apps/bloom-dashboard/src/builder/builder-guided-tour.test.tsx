/**
 * @vitest-environment jsdom
 */
import type { ApplicationConfig } from "@bloom/api-client";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { guidedTourProgressKey, loadGuidedTourProgress } from "../ui/guided-tour-progress";
import { BuilderGuidedTour, evaluateBuilderTour } from "./BuilderGuidedTour";

const selection = { appId: "explorer-manager", configId: "explorer-manager", screenId: "drive" };

const application = {
  id: "explorer-manager",
  name: "Explorer Manager",
  description: "Operator application",
  action_presets: [],
  runtime_policy: {
    command_frame_id: "base_link",
    allowed_message_types: [],
    allowed_publish_topics: [],
    allowed_recording_topics: [],
    allowed_service_calls: [],
    allowed_teleop_targets: ["/joystick_cartesian_command"],
  },
  theme: {
    inspiration: { moodboard_image_uri: "", reference_url: "" },
    preset_id: "bloom-default",
    palette: { accent: "#d9a441", background: "#f7f1e6", primary: "#7f967e", surface: "#fffdf7" },
  },
  profiles: [
    {
      id: "operator",
      name: "Operator",
      display_preset: "default",
      font_scale: 1,
      app_theme_preset_id: "bloom-default",
      preferred_control_layout_id: "",
      motor_accessibility_preset: "default",
    },
  ],
  screens: [
    {
      id: "drive",
      title: "Drive",
      canvas: { preset_id: "native-1280x720", runtime_mode: "fit" },
      widgets: [
        {
          id: "translation",
          kind: "joystick",
          title: "Translation",
          layout: { x: 80, y: 100, width: 320, height: 320 },
          settings: {
            runtime_binding: {
              adapter: "teleop",
              value_mapping: { target_topic: "/joystick_cartesian_command" },
            },
          },
        },
      ],
    },
  ],
} as ApplicationConfig;

function renderTour(overrides: Partial<Parameters<typeof BuilderGuidedTour>[0]> = {}) {
  const callbacks = {
    onClose: vi.fn(),
    onOpenConfiguration: vi.fn(),
    onOpenScreenBuilder: vi.fn(),
    onPreviewRuntime: vi.fn(),
  };
  render(<BuilderGuidedTour application={application} selection={selection} {...callbacks} {...overrides} />);
  return callbacks;
}

describe("the builder review checklist", () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:review") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("derives authoring checks from the application instead of advancing them manually", () => {
    expect(evaluateBuilderTour(application)).toEqual({
      geometry: true,
      touch: true,
      frame: true,
      topics: true,
      profile: true,
    });

    expect(
      evaluateBuilderTour({
        ...application,
        runtime_policy: { ...application.runtime_policy, command_frame_id: "", allowed_teleop_targets: [] },
        screens: [
          {
            ...application.screens[0],
            canvas: { preset_id: "tablet", runtime_mode: "fit" },
            widgets: [
              {
                ...application.screens[0].widgets[0],
                layout: { x: 80, y: 100, width: 30, height: 30 },
              },
            ],
          },
        ],
      }),
    ).toEqual({ geometry: false, touch: false, frame: false, topics: false, profile: true });
  });

  it("earns profile and ship checks only through preview and export actions", async () => {
    const callbacks = renderTour();
    const tourKey = guidedTourProgressKey("builder", selection.configId, selection.appId);

    await waitFor(() => expect(loadGuidedTourProgress(tourKey)).toEqual(["geometry", "touch", "frame", "topics"]));
    expect(screen.getByRole("heading", { name: "Test as the person, not as you" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Open profile preview" }));
    expect(callbacks.onPreviewRuntime).toHaveBeenCalledWith(selection);
    expect(loadGuidedTourProgress(tourKey)).toContain("profile");

    fireEvent.click(screen.getByRole("button", { name: /06Ship it to the tablet/ }));
    fireEvent.click(screen.getByRole("button", { name: "Export reviewed app" }));

    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
    expect(loadGuidedTourProgress(tourKey)).toEqual(["geometry", "touch", "frame", "topics", "profile", "ship"]);
  });

  it("opens the screen containing the first topic-policy problem", () => {
    const callbacks = renderTour({
      application: {
        ...application,
        screens: [
          ...application.screens,
          {
            id: "sources",
            title: "Command Sources",
            canvas: { preset_id: "native-1280x720", runtime_mode: "fit" },
            widgets: [
              {
                id: "events",
                kind: "event-log",
                title: "Command events",
                layout: { x: 500, y: 100, width: 420, height: 240 },
                settings: {},
              },
            ],
          },
        ],
      },
    });

    expect(screen.getByText(/Command events on Command Sources has no topic/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Inspect widget bindings" }));

    expect(callbacks.onOpenScreenBuilder).toHaveBeenCalledWith({ ...selection, screenId: "sources" });
  });

  it("restores completed action checks after reopening", async () => {
    renderTour();
    fireEvent.click(screen.getByRole("button", { name: "Open profile preview" }));
    cleanup();

    renderTour();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /05Test as the person, not as youComplete/ })).toBeTruthy(),
    );
  });
});
