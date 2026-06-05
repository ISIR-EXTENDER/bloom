import type {
  ApplicationConfig,
  ApplicationTheme,
  CanvasPresetId,
  CanvasSettings,
  ConfigurationBundle,
  RuntimeActionPreset,
  RuntimeAdapterPolicy,
  RuntimeCanvasMode,
  ScreenConfig,
  WidgetConfig,
  WidgetKind,
  WidgetLayout,
} from "@bloom/api-client";
import { DEFAULT_ACTION_PRESETS, DEFAULT_APPLICATION_THEME, DEFAULT_RUNTIME_POLICY } from "@bloom/api-client";

type PartialConfigurationBundle = Partial<Omit<ConfigurationBundle, "applications" | "metadata">> & {
  applications?: PartialApplicationConfig[];
  metadata?: Partial<ConfigurationBundle["metadata"]>;
};

type PartialApplicationConfig = Partial<Omit<ApplicationConfig, "screens">> & {
  action_presets?: PartialRuntimeActionPreset[];
  profiles?: ApplicationConfig["profiles"];
  runtime_policy?: PartialRuntimeAdapterPolicy;
  screens?: PartialScreenConfig[];
  theme?: PartialApplicationTheme;
};

type PartialRuntimeAdapterPolicy = Partial<RuntimeAdapterPolicy>;
type PartialRuntimeActionPreset = Partial<RuntimeActionPreset>;

type PartialApplicationTheme = Partial<Omit<ApplicationTheme, "palette">> & {
  inspiration?: Partial<ApplicationTheme["inspiration"]>;
  palette?: Partial<ApplicationTheme["palette"]>;
};

type PartialScreenConfig = Partial<Omit<ScreenConfig, "canvas" | "widgets">> & {
  canvas?: Partial<CanvasSettings>;
  widgets?: PartialWidgetConfig[];
};

type PartialWidgetConfig = Partial<Omit<WidgetConfig, "layout">> & {
  layout?: Partial<WidgetLayout>;
};

const CANVAS_PRESET_IDS = new Set<CanvasPresetId>(["native-1024x600", "hd", "tablet", "full-hd", "local-screen"]);
const RUNTIME_CANVAS_MODES = new Set<RuntimeCanvasMode>(["left", "center", "fit"]);
const WIDGET_KINDS = new Set<WidgetKind>([
  "button",
  "camera",
  "command-button",
  "event-log",
  "gauge",
  "gesture-pad",
  "joystick",
  "label",
  "plot",
  "robot-3d",
  "slider",
  "toggle",
  "topic-echo",
  "topic-plot",
  "unknown",
]);

const DEFAULT_CANVAS: CanvasSettings = {
  preset_id: "tablet",
  runtime_mode: "fit",
};

const DEFAULT_THEME_INSPIRATION: ApplicationTheme["inspiration"] = {
  moodboard_image_uri: "",
  reference_url: "",
};

const DEFAULT_WIDGET_LAYOUT: WidgetLayout = {
  x: 0,
  y: 0,
  width: 240,
  height: 120,
};

export function normalizeConfigurationBundle(bundle: ConfigurationBundle): ConfigurationBundle {
  const partialBundle = bundle as PartialConfigurationBundle;

  return {
    metadata: {
      schema_version: asNumber(partialBundle.metadata?.schema_version, 1),
      exported_at: asString(partialBundle.metadata?.exported_at, new Date(0).toISOString()),
      source: asString(partialBundle.metadata?.source, "unknown"),
    },
    applications: (partialBundle.applications ?? []).map(normalizeApplication),
  };
}

function normalizeApplication(application: PartialApplicationConfig, index: number): ApplicationConfig {
  const id = asString(application.id, `application-${index + 1}`);

  return {
    id,
    name: asString(application.name, id),
    description: asString(application.description, ""),
    action_presets: normalizeActionPresets(application.action_presets),
    runtime_policy: normalizeRuntimePolicy(application.runtime_policy),
    theme: normalizeApplicationTheme(application.theme),
    profiles: Array.isArray(application.profiles) ? application.profiles : [],
    screens: (application.screens ?? []).map((screen, screenIndex) => normalizeScreen(screen, screenIndex)),
  };
}

function normalizeActionPresets(presets: PartialRuntimeActionPreset[] | undefined): RuntimeActionPreset[] {
  if (!Array.isArray(presets)) {
    return DEFAULT_ACTION_PRESETS;
  }

  const usedIds = new Set<string>();
  return presets.map((preset, index) => {
    const fallbackId = `preset-${index + 1}`;
    const id = createUniquePresetId(asString(preset.id, fallbackId), usedIds);
    usedIds.add(id);

    return {
      id,
      name: asString(preset.name, id),
      kind: asString(preset.kind, "topic-publish"),
      description: asString(preset.description, ""),
      command: asString(preset.command, ""),
      topic: asString(preset.topic, ""),
      message_type: asString(preset.message_type, ""),
      payload: isJsonLike(preset.payload) ? preset.payload : null,
      payload_text: asString(preset.payload_text, ""),
      tags: asStringArray(preset.tags, []),
    };
  });
}

function normalizeRuntimePolicy(policy: PartialRuntimeAdapterPolicy | undefined): RuntimeAdapterPolicy {
  return {
    allowed_message_types: asStringArray(policy?.allowed_message_types, DEFAULT_RUNTIME_POLICY.allowed_message_types),
    allowed_publish_topics: asStringArray(
      policy?.allowed_publish_topics,
      DEFAULT_RUNTIME_POLICY.allowed_publish_topics,
    ),
    allowed_recording_topics: asStringArray(
      policy?.allowed_recording_topics,
      DEFAULT_RUNTIME_POLICY.allowed_recording_topics,
    ),
    allowed_teleop_targets: asStringArray(
      policy?.allowed_teleop_targets,
      DEFAULT_RUNTIME_POLICY.allowed_teleop_targets,
    ),
  };
}

function createUniquePresetId(id: string, usedIds: ReadonlySet<string>): string {
  if (!usedIds.has(id)) {
    return id;
  }

  let suffix = 2;
  let nextId = `${id}-${suffix}`;
  while (usedIds.has(nextId)) {
    suffix += 1;
    nextId = `${id}-${suffix}`;
  }
  return nextId;
}

function isJsonLike(value: unknown): boolean {
  if (value === undefined) {
    return false;
  }

  try {
    JSON.stringify(value);
    return true;
  } catch {
    return false;
  }
}

function normalizeApplicationTheme(theme: PartialApplicationTheme | undefined): ApplicationTheme {
  return {
    inspiration: {
      moodboard_image_uri: asString(
        theme?.inspiration?.moodboard_image_uri,
        DEFAULT_THEME_INSPIRATION.moodboard_image_uri,
      ),
      reference_url: asString(theme?.inspiration?.reference_url, DEFAULT_THEME_INSPIRATION.reference_url),
    },
    preset_id: asString(theme?.preset_id, DEFAULT_APPLICATION_THEME.preset_id),
    palette: {
      accent: asColorString(theme?.palette?.accent, DEFAULT_APPLICATION_THEME.palette.accent),
      background: asColorString(theme?.palette?.background, DEFAULT_APPLICATION_THEME.palette.background),
      primary: asColorString(theme?.palette?.primary, DEFAULT_APPLICATION_THEME.palette.primary),
      surface: asColorString(theme?.palette?.surface, DEFAULT_APPLICATION_THEME.palette.surface),
    },
  };
}

function normalizeScreen(screen: PartialScreenConfig, index: number): ScreenConfig {
  const id = asString(screen.id, `screen-${index + 1}`);

  return {
    id,
    title: asString(screen.title, id),
    canvas: normalizeCanvas(screen.canvas),
    widgets: (screen.widgets ?? []).map((widget, widgetIndex) => normalizeWidget(widget, widgetIndex)),
  };
}

function normalizeCanvas(canvas: Partial<CanvasSettings> | undefined): CanvasSettings {
  return {
    preset_id: isCanvasPresetId(canvas?.preset_id) ? canvas.preset_id : DEFAULT_CANVAS.preset_id,
    runtime_mode: isRuntimeCanvasMode(canvas?.runtime_mode) ? canvas.runtime_mode : DEFAULT_CANVAS.runtime_mode,
  };
}

function normalizeWidget(widget: PartialWidgetConfig, index: number): WidgetConfig {
  const id = asString(widget.id, `widget-${index + 1}`);
  const kind = isWidgetKind(widget.kind) ? widget.kind : "unknown";

  return {
    id,
    kind,
    title: asString(widget.title, id),
    layout: normalizeWidgetLayout(widget.layout),
    settings: isRecord(widget.settings) ? widget.settings : {},
  };
}

function normalizeWidgetLayout(layout: Partial<WidgetLayout> | undefined): WidgetLayout {
  return {
    x: asNumber(layout?.x, DEFAULT_WIDGET_LAYOUT.x),
    y: asNumber(layout?.y, DEFAULT_WIDGET_LAYOUT.y),
    width: asNumber(layout?.width, DEFAULT_WIDGET_LAYOUT.width),
    height: asNumber(layout?.height, DEFAULT_WIDGET_LAYOUT.height),
  };
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asColorString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function asStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCanvasPresetId(value: unknown): value is CanvasPresetId {
  return typeof value === "string" && CANVAS_PRESET_IDS.has(value as CanvasPresetId);
}

function isRuntimeCanvasMode(value: unknown): value is RuntimeCanvasMode {
  return typeof value === "string" && RUNTIME_CANVAS_MODES.has(value as RuntimeCanvasMode);
}

function isWidgetKind(value: unknown): value is WidgetKind {
  return typeof value === "string" && WIDGET_KINDS.has(value as WidgetKind);
}
