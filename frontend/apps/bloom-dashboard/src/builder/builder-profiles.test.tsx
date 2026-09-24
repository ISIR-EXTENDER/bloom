/**
 * @vitest-environment jsdom
 */
import type { ApplicationConfig } from "@bloom/api-client";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  addProfileToApplication,
  removeProfileFromApplication,
  updateProfileInApplication,
} from "../configurations/configuration-editor";
import { BuilderProfilesPanel } from "./BuilderProfilesPanel";

const application = {
  id: "my-app",
  name: "My app",
  description: "",
  lifecycle: "active",
  action_presets: [],
  runtime_policy: { allowed_teleop_targets: ["/joystick_cartesian_command"] },
  theme: { preset_id: "bloom-default" },
  screens: [
    { id: "drive", title: "Drive", canvas: {}, reserved_regions: [], widgets: [] },
    { id: "feedback", title: "Robot feedback", canvas: {}, reserved_regions: [], widgets: [] },
  ],
  profiles: [
    {
      id: "operator",
      name: "Operator",
      display_preset: "comfort",
      font_scale: 1,
      app_theme_preset_id: "bloom-default",
      preferred_control_layout_id: "drive",
      motor_accessibility_preset: "default",
      language: "en",
      audio_cues: false,
      deadzone: 0,
      repeat_guard_ms: 0,
      scan_period_ms: 1400,
      dwell_enabled: false,
      dwell_ms: 1000,
    },
  ],
} as unknown as ApplicationConfig;

/**
 * Roles drive the library's cards, the kiosk bar's role switch, and which screen opens. The Builder
 * could mint exactly one, hardcoded, at app creation, so the whole scanning and one-switch story was
 * unauthorable -- while the review checklist already validated profiles it could not create.
 */
describe("authoring roles", () => {
  afterEach(cleanup);

  it("names the app's own screens as the one a role opens on", () => {
    render(
      <BuilderProfilesPanel
        application={application}
        onAddProfile={vi.fn()}
        onRemoveProfile={vi.fn()}
        onUpdateProfile={vi.fn()}
      />,
    );

    const opensOn = screen.getByLabelText("Opens on") as HTMLSelectElement;
    expect([...opensOn.options].map((option) => option.textContent)).toEqual([
      "First screen",
      "Drive",
      "Robot feedback",
    ]);
    expect(opensOn.value).toBe("drive");
  });

  it("offers scanning, and asks for its step only once it is chosen", () => {
    const onUpdateProfile = vi.fn();
    const { rerender } = render(
      <BuilderProfilesPanel
        application={application}
        onAddProfile={vi.fn()}
        onRemoveProfile={vi.fn()}
        onUpdateProfile={onUpdateProfile}
      />,
    );

    expect(screen.queryByLabelText("Scan step (ms)")).toBeNull();
    fireEvent.change(screen.getByLabelText("How they reach controls"), { target: { value: "scan" } });
    expect(onUpdateProfile).toHaveBeenCalledWith("operator", { motor_accessibility_preset: "scan" });

    const scanning = updateProfileInApplication(application, "operator", { motor_accessibility_preset: "scan" });
    rerender(
      <BuilderProfilesPanel
        application={scanning}
        onAddProfile={vi.fn()}
        onRemoveProfile={vi.fn()}
        onUpdateProfile={onUpdateProfile}
      />,
    );
    expect(screen.getByLabelText("Scan step (ms)")).toBeTruthy();
  });

  // `reduced-motion` left the model on 2026-09-24; a value that changed nothing must never come back as a choice.
  it("does not offer a preset the runtime ignores", () => {
    render(
      <BuilderProfilesPanel
        application={application}
        onAddProfile={vi.fn()}
        onRemoveProfile={vi.fn()}
        onUpdateProfile={vi.fn()}
      />,
    );

    const reach = screen.getByLabelText("How they reach controls") as HTMLSelectElement;
    expect([...reach.options].map((option) => option.value)).not.toContain("reduced-motion");
  });
});

describe("the role editor helpers", () => {
  it("adds, updates and removes", () => {
    const added = addProfileToApplication(application, {
      ...(application.profiles[0] as ApplicationConfig["profiles"][number]),
      id: "one-switch",
      name: "One switch",
    });
    expect(added.profiles.map((profile) => profile.id)).toEqual(["operator", "one-switch"]);

    const updated = updateProfileInApplication(added, "one-switch", { motor_accessibility_preset: "scan" });
    expect(updated.profiles[1]?.motor_accessibility_preset).toBe("scan");

    expect(removeProfileFromApplication(updated, "operator").profiles.map((profile) => profile.id)).toEqual([
      "one-switch",
    ]);
  });

  it("refuses a duplicate id and an unknown one", () => {
    expect(() =>
      addProfileToApplication(application, application.profiles[0] as ApplicationConfig["profiles"][number]),
    ).toThrow(/already exists/);
    expect(() => updateProfileInApplication(application, "ghost", { name: "x" })).toThrow(/was not found/);
  });
});
