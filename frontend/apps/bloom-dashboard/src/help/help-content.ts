export const BLOOM_HELP_LAST_UPDATED = "2026-09-17";
export const BLOOM_CODE_REFERENCE_DATE = "2026-09-17";

export const bloomCapabilities = [
  {
    title: "Create robot web apps without web code",
    description: "Start from a Bloom app, configure its identity and theme, then compose it from reusable screens.",
  },
  {
    title: "Build screens visually",
    description:
      "Place, resize, and configure widgets on the panel at true proportion. Bloom tags widgets below their minimum size and keeps them out of the regions STOP owns.",
  },
  {
    title: "Operate through a kiosk",
    description:
      "Operators open an app as a role, which picks its screen. STOP stays live in its reserved region, and navigation, settings, and editing stay behind the Maintenance hold.",
  },
  {
    title: "Reuse screens across apps",
    description:
      "The screen library lets you search, preview, edit, and runtime-test screens before assigning them to an app.",
  },
  {
    title: "Keep robot protocols behind adapters",
    description:
      "Widgets emit generic runtime intents. ROS topics, teleop commands, debug streams, and future non-ROS systems live behind backend adapters.",
  },
  {
    title: "Choose how controls are operated",
    description:
      "Profiles can adapt target size, keyboard/touch behavior, step, latch, dwell, gamepad input, dead-zone conditioning, repeat guards, and audio cues.",
  },
];

export const getStartedSteps = [
  {
    title: "1. Open Builder",
    description:
      "Use Builder from the top navigation. The overview separates full app workflows, reusable screen work, and quick playground checks.",
  },
  {
    title: "2. Configure an app",
    description:
      "Open an app card to edit identity, theme, profiles, runtime guardrails, the shared Cartesian command frame, and the screens that belong to the app.",
  },
  {
    title: "3. Compose the app flow",
    description:
      "Create a screen, duplicate an existing one, drag reusable screens into the app, or reorder screens with drag/drop or Move up/down buttons.",
  },
  {
    title: "4. Edit a screen",
    description:
      "Open the full-page builder. Add widgets from the palette, move or resize them, and use the inspector for widget-specific settings. The size chip gives each widget's glass size on the smallest panel of its class; a Too small tag offers the exact resize.",
  },
  {
    title: "5. Launch runtime",
    description:
      "Open Runtime, select the app, choose a role, and press Open as. Verify the app, screen, link, command frame, and role in the kiosk bar before moving a control.",
  },
  {
    title: "6. Check operation",
    description:
      "Confirm STOP and held resume, zero on release, the Maintenance hold, and every touch, keyboard, gamepad, or accessibility profile the session will use.",
  },
  {
    title: "7. Debug before deployment",
    description:
      "Use Bloom Debug and playground screens to inspect topics, validate widget behavior, and check robot-facing bindings before a real user test.",
  },
];

export const helpMaintenanceChecklist = [
  "Update this guide when a new user-facing builder/runtime workflow lands.",
  "Update screenshots in the README when the visible UI changes significantly.",
  "Keep docs and code dates close; if they drift, create a documentation follow-up before the next release.",
  "Prefer examples from real Bloom fixtures so the guide stays testable.",
];
