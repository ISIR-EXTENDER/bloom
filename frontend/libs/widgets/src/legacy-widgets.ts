import type { WidgetKind } from "@bloom/api-client";

/** How each extender_ui widget kind maps onto Bloom's, for the importer and its documentation. */
export type LegacyWidgetCompatibility = "direct" | "renamed" | "adapter-required" | "app-specific" | "unsupported";

export type LegacyWidgetKind =
  | "joystick"
  | "slider"
  | "mode-button"
  | "save-pose-button"
  | "load-pose-button"
  | "navigation-button"
  | "navigation-bar"
  | "text"
  | "textarea"
  | "button"
  | "rosbag-control"
  | "max-velocity"
  | "gripper-control"
  | "magnet-control"
  | "toggle-publisher"
  | "ros-message-toggle"
  | "stream-display"
  | "throw-draw"
  | "drink"
  | "curves"
  | "logs"
  | "momentary-ros-message"
  | "topic-monitor";

export type LegacyWidgetKindMapping = {
  legacyKind: string;
  bloomKind: WidgetKind;
  compatibility: LegacyWidgetCompatibility;
  displayName: string;
  notes: string;
};

export type LegacyWidgetRect = {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  width?: number;
  height?: number;
};

export const LEGACY_WIDGET_KIND_MAPPINGS: Readonly<Record<LegacyWidgetKind, LegacyWidgetKindMapping>> = {
  joystick: {
    legacyKind: "joystick",
    bloomKind: "joystick",
    compatibility: "direct",
    displayName: "Joystick",
    notes: "The legacy kind already matches the Bloom generic input widget.",
  },
  slider: {
    legacyKind: "slider",
    bloomKind: "slider",
    compatibility: "direct",
    displayName: "Slider",
    notes: "The legacy kind already matches the Bloom generic input widget.",
  },
  "mode-button": {
    legacyKind: "mode-button",
    bloomKind: "command-button",
    compatibility: "adapter-required",
    displayName: "Mode button",
    notes: "Requires a teleoperation adapter before it can trigger runtime mode changes.",
  },
  "save-pose-button": {
    legacyKind: "save-pose-button",
    bloomKind: "command-button",
    compatibility: "adapter-required",
    displayName: "Save pose button",
    notes: "Requires a pose/session adapter before it can persist robot poses.",
  },
  "load-pose-button": {
    legacyKind: "load-pose-button",
    bloomKind: "command-button",
    compatibility: "adapter-required",
    displayName: "Load pose button",
    notes: "Requires a pose/session adapter before it can command saved poses.",
  },
  "navigation-button": {
    legacyKind: "navigation-button",
    bloomKind: "command-button",
    compatibility: "renamed",
    displayName: "Navigation button",
    notes: "A command button that navigates to its target screen.",
  },
  "navigation-bar": {
    legacyKind: "navigation-bar",
    bloomKind: "unknown",
    compatibility: "unsupported",
    displayName: "Navigation bar",
    notes: "Needs a dedicated navigation/layout model before migration.",
  },
  text: {
    legacyKind: "text",
    bloomKind: "label",
    compatibility: "renamed",
    displayName: "Text",
    notes: "Static text maps to Bloom label semantics.",
  },
  textarea: {
    legacyKind: "textarea",
    bloomKind: "label",
    compatibility: "renamed",
    displayName: "Textarea",
    notes: "Multiline static text maps to Bloom label semantics for the first migration pass.",
  },
  button: {
    legacyKind: "button",
    bloomKind: "command-button",
    compatibility: "renamed",
    displayName: "Action button",
    notes: "Legacy buttons publish commands, so they map to Bloom command buttons.",
  },
  "rosbag-control": {
    legacyKind: "rosbag-control",
    bloomKind: "command-button",
    compatibility: "adapter-required",
    displayName: "Rosbag control",
    notes: "Requires a backend recording adapter before it can control rosbag sessions.",
  },
  "max-velocity": {
    legacyKind: "max-velocity",
    bloomKind: "slider",
    compatibility: "adapter-required",
    displayName: "Max velocity",
    notes: "Uses slider semantics but requires a teleoperation settings adapter.",
  },
  "gripper-control": {
    legacyKind: "gripper-control",
    bloomKind: "toggle",
    compatibility: "adapter-required",
    displayName: "Gripper control",
    notes: "Requires a device adapter before it can publish gripper commands.",
  },
  "magnet-control": {
    legacyKind: "magnet-control",
    bloomKind: "toggle",
    compatibility: "adapter-required",
    displayName: "Magnet control",
    notes: "Requires a device adapter before it can publish magnet commands.",
  },
  "toggle-publisher": {
    legacyKind: "toggle-publisher",
    bloomKind: "toggle",
    compatibility: "adapter-required",
    displayName: "Toggle publisher",
    notes: "Requires a publisher adapter before it can emit configured ON/OFF payloads.",
  },
  "ros-message-toggle": {
    legacyKind: "ros-message-toggle",
    bloomKind: "toggle",
    compatibility: "adapter-required",
    displayName: "ROS message toggle",
    notes: "Requires typed ROS message publishing before it can emit structured ON/OFF payloads.",
  },
  "momentary-ros-message": {
    legacyKind: "momentary-ros-message",
    bloomKind: "command-button",
    compatibility: "adapter-required",
    displayName: "Momentary ROS message",
    notes: "Maps to a momentary Bloom command button that publishes pressed and released payloads.",
  },
  "topic-monitor": {
    legacyKind: "topic-monitor",
    bloomKind: "topic-echo",
    compatibility: "renamed",
    displayName: "Topic monitor",
    notes: "Maps to topic echo semantics for live diagnostic topic snapshots.",
  },
  "stream-display": {
    legacyKind: "stream-display",
    bloomKind: "camera",
    compatibility: "renamed",
    displayName: "Stream display",
    notes: "Maps to Bloom camera/stream display semantics for the first migration pass.",
  },
  "throw-draw": {
    legacyKind: "throw-draw",
    bloomKind: "gesture-pad",
    compatibility: "renamed",
    displayName: "Gesture draw",
    notes: "Maps to Bloom gesture-pad semantics for angle/power trajectory-like commands.",
  },
  drink: {
    legacyKind: "drink",
    bloomKind: "command-button",
    compatibility: "adapter-required",
    displayName: "Media action button",
    notes:
      "Reusable media/action overlay candidate; migrate later as a generic widget instead of a Petanque-only widget.",
  },
  curves: {
    legacyKind: "curves",
    bloomKind: "plot",
    compatibility: "renamed",
    displayName: "Curves",
    notes: "Maps to Bloom plot semantics.",
  },
  logs: {
    legacyKind: "logs",
    bloomKind: "event-log",
    compatibility: "renamed",
    displayName: "Logs",
    notes: "Legacy logs map to Bloom's generic event log for operator-readable events.",
  },
};

export function resolveLegacyWidgetKind(kind: string): LegacyWidgetKindMapping {
  return (
    LEGACY_WIDGET_KIND_MAPPINGS[kind as LegacyWidgetKind] ?? {
      legacyKind: kind,
      bloomKind: "unknown",
      compatibility: "unsupported",
      displayName: kind,
      notes: `No legacy widget mapping is registered for kind "${kind}".`,
    }
  );
}
