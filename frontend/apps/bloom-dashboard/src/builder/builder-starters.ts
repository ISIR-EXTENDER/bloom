/** What a new app starts from: the wizard's choices, the starter screens and the first role. */
import {
  type ApplicationConfig,
  DEFAULT_ACTION_PRESETS,
  DEFAULT_APPLICATION_THEME,
  DEFAULT_RUNTIME_POLICY,
  type ScreenConfig,
  type UserProfile,
} from "@bloom/api-client";
import { gripperToggleSettings, PALETTE_WIRING, speedSliderSettings, translationPadSettings } from "@bloom/widgets";
import { ensureUniqueId } from "../configurations/configuration-editor";
import { defaultStopRegion, NEW_TABLET_CANVAS } from "./builder-geometry";
import { createNewApplicationName, slugify } from "./builderHomeModel";

export type CreateWizardState = {
  includeOnboardingSpots: boolean;
  name: string;
  starterId: StarterScreenId;
  themePresetId: CreateThemePresetId;
};

export type StarterScreenId = "blank" | "operator-control" | "debug-monitor";
export type CreateThemePresetId = "bloom-default" | "extender-ui" | "high-visibility";

export const CREATE_THEME_PRESETS: Record<CreateThemePresetId, ApplicationConfig["theme"]> = {
  "bloom-default": {
    ...DEFAULT_APPLICATION_THEME,
    preset_id: "bloom-default",
    palette: {
      accent: "#d9a441",
      background: "#f7f1e6",
      primary: "#7f967e",
      surface: "#fffdf7",
    },
  },
  // The app default is Bloom Garden, so "Extender light" must name its own preset.
  "extender-ui": {
    ...DEFAULT_APPLICATION_THEME,
    preset_id: "extender-ui",
    palette: {
      accent: "#0ea5e9",
      background: "#f8fafc",
      primary: "#1d4ed8",
      surface: "#ffffff",
    },
  },
  "high-visibility": {
    ...DEFAULT_APPLICATION_THEME,
    preset_id: "high-contrast",
    palette: {
      accent: "#ffcc00",
      background: "#ffffff",
      primary: "#0033cc",
      surface: "#ffffff",
    },
  },
};

export const STARTER_SCREEN_LABELS: Record<StarterScreenId, string> = {
  blank: "Blank canvas",
  "operator-control": "Operator controls",
  "debug-monitor": "Debug monitor",
};

export function createDefaultWizardState(applications: readonly ApplicationConfig[]): CreateWizardState {
  return {
    includeOnboardingSpots: true,
    name: createNewApplicationName(applications),
    starterId: "operator-control",
    themePresetId: "bloom-default",
  };
}

export function createGuidedApplication(
  wizard: CreateWizardState,
  existingApplications: readonly ApplicationConfig[],
  robotName?: string,
): ApplicationConfig {
  const name = wizard.name.trim() || createNewApplicationName(existingApplications);
  const id = ensureUniqueId(slugify(name), new Set(existingApplications.map((application) => application.id)));
  const screen = createStarterScreen(wizard.starterId, wizard.includeOnboardingSpots, robotName);

  return {
    id,
    name,
    description: `${STARTER_SCREEN_LABELS[wizard.starterId]} starter app`,
    action_presets: DEFAULT_ACTION_PRESETS,
    runtime_policy: DEFAULT_RUNTIME_POLICY,
    theme: CREATE_THEME_PRESETS[wizard.themePresetId],
    // A role the app can be opened as: the library launches roles, and the review checklist asks for one.
    profiles: [createStarterProfile(screen.id, wizard.themePresetId)],
    screens: [screen],
  };
}

/** Shared with the app config, so a role added later starts life like the one created with the app. */
export function createStarterProfile(screenId: string, themePresetId: CreateThemePresetId): UserProfile {
  return {
    id: "operator",
    name: "Operator",
    display_preset: "comfort",
    font_scale: 1,
    app_theme_preset_id: themePresetId,
    preferred_control_layout_id: screenId,
    motor_accessibility_preset: "default",
    audio_cues: false,
    deadzone: 0,
    repeat_guard_ms: 0,
    scan_period_ms: 1400,
  };
}

export function createApplicationFromPlaygroundScreen(
  screen: ScreenConfig,
  sourceApplication: ApplicationConfig,
  existingApplications: readonly ApplicationConfig[],
): ApplicationConfig {
  const name = `${screen.title || "Playground"} Draft`;
  const id = ensureUniqueId(slugify(name), new Set(existingApplications.map((application) => application.id)));

  return {
    id,
    name,
    description: `Promoted from ${sourceApplication.name}`,
    action_presets: sourceApplication.action_presets,
    runtime_policy: sourceApplication.runtime_policy,
    theme: sourceApplication.theme,
    // The promoted screen is renamed, so a copied profile would name a screen this app does not have
    // and the new app would fail its own review checklist the moment it was created.
    profiles: sourceApplication.profiles.map((profile) => ({ ...profile, preferred_control_layout_id: "main" })),
    screens: [
      {
        ...screen,
        id: "main",
        title: screen.title || "Main",
      },
    ],
  };
}

/** Exported for the test that keeps a starter honest about what it publishes. */
export function createStarterScreen(
  starterId: StarterScreenId,
  includeOnboardingSpots: boolean,
  robotName?: string,
): ScreenConfig {
  const onboardingWidgets = includeOnboardingSpots
    ? [
        {
          id: "onboarding-title",
          kind: "label" as const,
          title: "Onboarding title",
          layout: { x: 48, y: 36, width: 560, height: 86 },
          settings: {
            align: "left",
            fontSize: 28,
            text: "Name the operator task and replace this starter guidance.",
          },
        },
      ]
    : [];

  if (starterId === "debug-monitor") {
    return {
      id: "main",
      title: "Debug Monitor",
      canvas: { ...NEW_TABLET_CANVAS },
      reserved_regions: [defaultStopRegion(NEW_TABLET_CANVAS)],
      widgets: [
        ...onboardingWidgets,
        {
          id: "topic-echo",
          kind: "topic-echo",
          title: "Topic echo",
          layout: { x: 48, y: 152, width: 520, height: 240 },
          settings: { ...PALETTE_WIRING["topic-echo"]?.settings, maxMessages: 40, prettyPrint: true },
        },
        {
          id: "runtime-events",
          kind: "event-log",
          title: "Mode requests",
          layout: { x: 608, y: 152, width: 540, height: 240 },
          settings: {
            ...PALETTE_WIRING["event-log"]?.settings,
            maxEntries: 6,
            severityFilter: ["success", "info", "warning", "error"],
          },
        },
      ],
    };
  }

  if (starterId === "operator-control") {
    return {
      id: "main",
      title: "Operator Controls",
      canvas: { ...NEW_TABLET_CANVAS },
      reserved_regions: [defaultStopRegion(NEW_TABLET_CANVAS)],
      widgets: [
        ...onboardingWidgets,
        {
          id: "teleop-joystick",
          kind: "joystick",
          title: "Translation",
          // 280x332 is the joystick contract; a starter below it greets a new author with a warning.
          layout: { x: 72, y: 160, width: 300, height: 332 },
          // The Manager apps' pad for this arm: its words and its axes, so up moves the hand forward.
          settings: translationPadSettings(robotName),
        },
        {
          id: "max-velocity",
          kind: "slider",
          // It published to /cmd/max_velocity, which nothing on either arm reads: the first touch failed.
          title: PALETTE_WIRING.slider?.title ?? "Max linear speed",
          layout: { x: 440, y: 190, width: 440, height: 132 },
          settings: speedSliderSettings(robotName),
        },
        {
          id: "gripper",
          kind: "toggle",
          title: "Gripper",
          layout: { x: 440, y: 360, width: 220, height: 120 },
          settings: gripperToggleSettings(robotName),
        },
      ],
    };
  }

  return {
    id: "main",
    title: "Main",
    canvas: { ...NEW_TABLET_CANVAS },
    reserved_regions: [defaultStopRegion(NEW_TABLET_CANVAS)],
    widgets: onboardingWidgets,
  };
}
