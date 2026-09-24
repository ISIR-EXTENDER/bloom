import type {
  ApplicationConfig,
  CanvasSettings,
  RuntimeAdapterPolicy,
  ScreenConfig,
  WidgetConfig,
  WidgetKind,
  WidgetLayout,
} from "@bloom/api-client";
import {
  DEFAULT_APPLICATION_THEME,
  DEFAULT_RUNTIME_POLICY,
  isCanvasPresetId,
  isRuntimeCanvasMode,
} from "@bloom/api-client";
import { DEFAULT_CANVAS_SETTINGS } from "./canvas-defaults";
import { isRecord, readNumber, readString } from "./values";

export type LegacyCanvasScreen = {
  id?: string;
  name?: string;
  title?: string;
  label?: string;
  canvas?: Record<string, unknown>;
  widgets?: LegacyCanvasWidget[];
};

export type LegacyApplication = {
  description?: string;
  homeScreenId?: string;
  id?: string;
  name?: string;
  screenIds?: string[];
};

export type LegacyCanvasWidget = {
  id: string;
  kind?: string;
  label?: string;
  title?: string;
  rect?: Record<string, unknown>;
  [key: string]: unknown;
};

const WIDGET_CONFIG_KEYS = new Set(["id", "kind", "label", "rect", "title"]);
// The legacy importer and the widget library must agree on what an unspecified
// canvas means, so this is the shared constant rather than a second copy of the
// same two values.
const DEFAULT_LEGACY_CANVAS_SETTINGS: CanvasSettings = DEFAULT_CANVAS_SETTINGS;
const DEFAULT_LEGACY_WIDGET_LAYOUT: WidgetLayout = {
  x: 0,
  y: 0,
  width: 160,
  height: 80,
};

export function legacyCanvasScreenToConfig(screen: LegacyCanvasScreen): ScreenConfig {
  const id = readString(screen.id, readString(screen.name, "legacy-screen"));
  const title = readString(screen.title, readString(screen.label, readString(screen.name, id)));

  return {
    id,
    title,
    canvas: legacyCanvasSettingsToConfig(screen.canvas),
    widgets: (screen.widgets ?? []).map(legacyCanvasWidgetToConfig),
  };
}

export function legacyCanvasScreensToApplicationConfig(
  screens: readonly LegacyCanvasScreen[],
  application: LegacyApplication = {},
): ApplicationConfig {
  const convertedScreens = screens.map(legacyCanvasScreenToConfig);
  const orderedScreens = orderScreensByLegacyApplication(convertedScreens, application.screenIds);
  const id = readString(application.id, "legacy-application");
  const homeScreenDescription = application.homeScreenId ? `Home screen: ${application.homeScreenId}` : "";

  return {
    id,
    name: readString(application.name, id),
    description: readString(application.description, homeScreenDescription),
    action_presets: [],
    runtime_policy: cloneRuntimePolicy(DEFAULT_RUNTIME_POLICY),
    theme: DEFAULT_APPLICATION_THEME,
    profiles: [],
    screens: orderedScreens,
  };
}

function cloneRuntimePolicy(policy: RuntimeAdapterPolicy): RuntimeAdapterPolicy {
  return {
    command_frame_id: policy.command_frame_id ?? "",
    allowed_message_types: [...policy.allowed_message_types],
    allowed_publish_topics: [...policy.allowed_publish_topics],
    allowed_recording_topics: [...policy.allowed_recording_topics],
    allowed_service_calls: [...policy.allowed_service_calls],
    allowed_teleop_targets: [...policy.allowed_teleop_targets],
  };
}

export function legacyCanvasWidgetToConfig(widget: LegacyCanvasWidget): WidgetConfig {
  return {
    id: widget.id,
    kind: legacyKindToBloomKind(readString(widget.kind, "unknown")),
    title: readString(widget.title, readString(widget.label, widget.id)),
    layout: legacyRectToLayout(widget.rect),
    settings: legacyWidgetSettingsToConfig(widget),
  };
}

function legacyCanvasSettingsToConfig(canvas: Record<string, unknown> | undefined): CanvasSettings {
  if (!canvas) {
    return { ...DEFAULT_LEGACY_CANVAS_SETTINGS };
  }
  return {
    preset_id: isCanvasPresetId(canvas.presetId) ? canvas.presetId : DEFAULT_LEGACY_CANVAS_SETTINGS.preset_id,
    runtime_mode: isRuntimeCanvasMode(canvas.runtimeMode)
      ? canvas.runtimeMode
      : DEFAULT_LEGACY_CANVAS_SETTINGS.runtime_mode,
  };
}

function orderScreensByLegacyApplication(
  screens: readonly ScreenConfig[],
  screenIds: string[] | undefined,
): ScreenConfig[] {
  if (!screenIds || screenIds.length === 0) {
    return [...screens];
  }

  const screensById = new Map(screens.map((screen) => [screen.id, screen]));
  const orderedScreens = screenIds.flatMap((screenId) => {
    const screen = screensById.get(screenId);
    return screen ? [screen] : [];
  });
  const remainingScreens = screens.filter((screen) => !screenIds.includes(screen.id));
  return [...orderedScreens, ...remainingScreens];
}

function legacyKindToBloomKind(kind: string): WidgetKind {
  const mapping: Record<string, WidgetKind> = {
    button: "command-button",
    camera: "camera",
    curves: "plot",
    drink: "command-button",
    "gripper-control": "toggle",
    joystick: "joystick",
    "load-pose-button": "command-button",
    "magnet-control": "toggle",
    "max-velocity": "slider",
    "momentary-ros-message": "command-button",
    "mode-button": "command-button",
    "navigation-button": "command-button",
    plot: "plot",
    "ros-message-toggle": "toggle",
    "rosbag-control": "command-button",
    "save-pose-button": "command-button",
    slider: "slider",
    "stream-display": "camera",
    text: "label",
    textarea: "label",
    "throw-draw": "gesture-pad",
    "topic-monitor": "topic-echo",
    toggle: "toggle",
    "toggle-publisher": "toggle",
  };
  return mapping[kind] ?? "unknown";
}

export function legacyRectToLayout(rect: Record<string, unknown> | undefined): WidgetLayout {
  if (!rect) {
    return { ...DEFAULT_LEGACY_WIDGET_LAYOUT };
  }
  return {
    x: readNumber(rect.x, DEFAULT_LEGACY_WIDGET_LAYOUT.x),
    y: readNumber(rect.y, DEFAULT_LEGACY_WIDGET_LAYOUT.y),
    width: readNumber(rect.w ?? rect.width, DEFAULT_LEGACY_WIDGET_LAYOUT.width),
    height: readNumber(rect.h ?? rect.height, DEFAULT_LEGACY_WIDGET_LAYOUT.height),
  };
}

function legacyWidgetSettingsToConfig(widget: LegacyCanvasWidget): Record<string, unknown> {
  const legacyKind = readString(widget.kind, "unknown");
  if (legacyKind === "momentary-ros-message") {
    return {
      ...copyLegacyWidgetSettings(widget),
      legacyKind,
      button_label: readString(widget.label, widget.id),
      command: "momentary_ros_message",
      momentary: true,
      payload: widget.pressedPayload ?? "{data: true}",
      releasedPayload: widget.releasedPayload ?? "{data: false}",
    };
  }
  if (legacyKind === "navigation-button") {
    return {
      ...copyLegacyWidgetSettings(widget),
      legacyKind,
      button_label: readString(widget.label, widget.id),
      command: "navigate_screen",
      targetScreenId: readString(widget.targetScreenId, ""),
    };
  }
  if (legacyKind === "topic-monitor") {
    const firstTopic = Array.isArray(widget.topics) ? widget.topics.find(isRecord) : undefined;
    return {
      ...copyLegacyWidgetSettings(widget),
      legacyKind,
      fieldPath: "",
      maxMessages: 20,
      messageType: readString(firstTopic?.messageType, ""),
      prettyPrint: true,
      show_details: widget.showDetails === true,
      topic: readString(firstTopic?.topic, readString(widget.topic, "")),
    };
  }
  return {
    ...copyLegacyWidgetSettings(widget),
    legacyKind,
  };
}

function copyLegacyWidgetSettings(widget: LegacyCanvasWidget): Record<string, unknown> {
  return Object.fromEntries(Object.entries(widget).filter(([key]) => !WIDGET_CONFIG_KEYS.has(key)));
}
