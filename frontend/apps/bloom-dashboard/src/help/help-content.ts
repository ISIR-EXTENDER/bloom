export const BLOOM_HELP_LAST_UPDATED = "2026-06-04";
export const BLOOM_CODE_REFERENCE_DATE = "2026-06-04";

export const bloomCapabilities = [
  {
    title: "Create robot web apps without web code",
    description: "Start from a Bloom app, configure its identity and theme, then compose it from reusable screens.",
  },
  {
    title: "Build screens visually",
    description:
      "Open the WYSIWYG screen builder to place, resize, inspect, and configure widgets on a tablet-sized canvas.",
  },
  {
    title: "Run the same screen model",
    description:
      "Runtime uses the same screen and widget layout as the builder, but without editor chrome or configuration tools.",
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
      "Open an app card to edit name, description, theme palette, moodboard/reference, and the screens that belong to the app.",
  },
  {
    title: "3. Compose the app flow",
    description:
      "Create a screen, duplicate an existing one, drag reusable screens into the app, or reorder screens with drag/drop or Move up/down buttons.",
  },
  {
    title: "4. Edit a screen",
    description:
      "Open the full-page builder. Add widgets from the palette, move or resize them, and use the inspector for widget-specific settings.",
  },
  {
    title: "5. Preview runtime",
    description:
      "Open runtime from an app, a screen library card, or the playground. Runtime hides builder controls so it behaves like the real operator app.",
  },
  {
    title: "6. Debug before deployment",
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
