/**
 * @vitest-environment jsdom
 */
import type { ApplicationConfig, UserProfile } from "@bloom/api-client";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { updateProfileInApplication } from "../configurations/configuration-editor";
import { BuilderProfilesPanel } from "./BuilderProfilesPanel";

const operator: UserProfile = {
  id: "operator",
  name: "Operator",
  display_preset: "comfort",
  font_scale: 1,
  app_theme_preset_id: "",
  preferred_control_layout_id: "drive",
  motor_accessibility_preset: "default",
  language: "en",
  audio_cues: false,
  deadzone: 0,
  repeat_guard_ms: 0,
  scan_period_ms: 1400,
  dwell_enabled: false,
  dwell_ms: 1000,
} as unknown as UserProfile;

const application = {
  id: "my-app",
  name: "My app",
  action_presets: [],
  runtime_policy: {},
  theme: { preset_id: "bloom-default" },
  screens: [
    { id: "drive", title: "Drive", canvas: {}, reserved_regions: [], widgets: [] },
    { id: "feedback", title: "Robot feedback", canvas: {}, reserved_regions: [], widgets: [] },
  ],
  profiles: [operator],
} as unknown as ApplicationConfig;

/** The panel against a live draft, so what a control writes is read back as the role it produced. */
function Harness({ onState }: { onState: (application: ApplicationConfig) => void }) {
  const [draft, setDraft] = useState(application);
  onState(draft);
  return (
    <BuilderProfilesPanel
      application={draft}
      onAddProfile={() => undefined}
      onRemoveProfile={() => undefined}
      onUpdateProfile={(id, patch) => setDraft((current) => updateProfileInApplication(current, id, patch))}
    />
  );
}

afterEach(cleanup);

describe("editing a role", () => {
  it("writes every field a control names into that role", () => {
    let latest = application;
    render(
      <Harness
        onState={(state) => {
          latest = state;
        }}
      />,
    );
    const card = within(screen.getByRole("listitem"));
    const role = () => latest.profiles[0] as UserProfile;

    fireEvent.change(card.getByLabelText("Name"), { target: { value: "Carer" } });
    expect(role().name).toBe("Carer");
    fireEvent.change(card.getByLabelText("Opens on"), { target: { value: "feedback" } });
    expect(role().preferred_control_layout_id).toBe("feedback");
    fireEvent.change(card.getByLabelText("Targets"), { target: { value: "high-visibility" } });
    expect(role().display_preset).toBe("high-visibility");
    fireEvent.change(card.getByLabelText("Colours"), { target: { value: "high-contrast" } });
    expect(role().app_theme_preset_id).toBe("high-contrast");
    fireEvent.change(card.getByLabelText("Language"), { target: { value: "fr" } });
    expect(role().language).toBe("fr");
    fireEvent.change(card.getByLabelText("Text size"), { target: { value: "1.5" } });
    expect(role().font_scale).toBe(1.5);

    fireEvent.change(card.getByLabelText("How they reach controls"), { target: { value: "scan" } });
    expect(role().motor_accessibility_preset).toBe("scan");
    fireEvent.change(card.getByLabelText("Scan step (ms)"), { target: { value: "2000" } });
    expect(role().scan_period_ms).toBe(2000);

    fireEvent.click(card.getByLabelText("Resting on a control presses it"));
    expect(role().dwell_enabled).toBe(true);
    fireEvent.change(card.getByLabelText("Rest for (ms)"), { target: { value: "1500" } });
    expect(role().dwell_ms).toBe(1500);
    fireEvent.click(card.getByLabelText("Sound on stop and link loss"));
    expect(role().audio_cues).toBe(true);
    fireEvent.click(card.getByLabelText(/A tap opens the menu/));
    expect(role().menu_on_tap).toBe(true);
    fireEvent.click(card.getByLabelText(/A tap opens the menu/));
    expect(role().menu_on_tap).toBe(false);

    // Every other field of the role is left as it was.
    expect(role()).toMatchObject({ id: "operator", deadzone: 0, repeat_guard_ms: 0 });
  });

  it("names the app's palette next to the option that follows it", () => {
    render(<Harness onState={() => undefined} />);
    const colours = screen.getByLabelText("Colours") as HTMLSelectElement;
    expect(colours.value).toBe("");
    expect(colours.options[0]?.textContent).toMatch(/^Same as app \(.+\)$/);
  });
});
