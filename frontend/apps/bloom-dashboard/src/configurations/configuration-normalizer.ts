import type {
  ApplicationConfig,
  ApplicationTheme,
  CanvasPresetId,
  CanvasSettings,
  ConfigurationBundle,
  ReservedRegion,
  RuntimeActionPreset,
  RuntimeAdapterPolicy,
  RuntimeCanvasMode,
  ScreenConfig,
  WidgetConfig,
  WidgetKind,
  WidgetLayout,
} from "@bloom/api-client";
import {
  WIDGET_KINDS as CANONICAL_WIDGET_KINDS,
  CURRENT_CONFIGURATION_SCHEMA_VERSION,
  DEFAULT_ACTION_PRESETS,
  DEFAULT_APPLICATION_THEME,
  DEFAULT_RUNTIME_POLICY,
} from "@bloom/api-client";
import { isRecord, readNumber, readString } from "@bloom/widgets";

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

type PartialScreenConfig = Partial<Omit<ScreenConfig, "canvas" | "widgets" | "reserved_regions">> & {
  reserved_regions?: unknown;
  canvas?: Partial<CanvasSettings>;
  widgets?: PartialWidgetConfig[];
};

type PartialWidgetConfig = Partial<Omit<WidgetConfig, "layout">> & {
  layout?: Partial<WidgetLayout>;
};

const CANVAS_PRESET_IDS = new Set<CanvasPresetId>([
  "native-1024x600",
  "native-1280x720",
  "hd",
  "tablet",
  "wide-tablet",
  "full-hd",
  "local-screen",
]);
const RUNTIME_CANVAS_MODES = new Set<RuntimeCanvasMode>(["left", "center", "fit", "operator-fit"]);
// The canonical list, not a copy: a private copy silently downgraded any
// newer kind to "unknown" at load time.
const WIDGET_KINDS = new Set<WidgetKind>(CANONICAL_WIDGET_KINDS);

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
      schema_version: normalizeSchemaVersion(partialBundle.metadata?.schema_version),
      exported_at: readString(partialBundle.metadata?.exported_at, new Date(0).toISOString()),
      source: readString(partialBundle.metadata?.source, "unknown"),
    },
    applications: (partialBundle.applications ?? []).map(normalizeApplication),
  };
}

function normalizeApplication(application: PartialApplicationConfig, index: number): ApplicationConfig {
  const id = readString(application.id, `application-${index + 1}`);

  return {
    id,
    name: readString(application.name, id),
    description: readString(application.description, ""),
    // An unknown or missing value normalizes to "active": a configuration
    // written before archiving existed describes an app still being carried
    // forward, and mislabelling one as archived would hide it from its operator.
    lifecycle: application.lifecycle === "archived" ? "archived" : "active",
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
    const id = createUniquePresetId(readString(preset.id, fallbackId), usedIds);
    usedIds.add(id);

    return {
      id,
      name: readString(preset.name, id),
      kind: readString(preset.kind, "topic-publish"),
      description: readString(preset.description, ""),
      command: readString(preset.command, ""),
      topic: readString(preset.topic, ""),
      message_type: readString(preset.message_type, ""),
      payload: isJsonLike(preset.payload) ? preset.payload : null,
      payload_text: readString(preset.payload_text, ""),
      tags: asStringArray(preset.tags, []),
    };
  });
}

function normalizeRuntimePolicy(policy: PartialRuntimeAdapterPolicy | undefined): RuntimeAdapterPolicy {
  return {
    command_frame_id: readString(policy?.command_frame_id, DEFAULT_RUNTIME_POLICY.command_frame_id ?? ""),
    allowed_message_types: asStringArray(policy?.allowed_message_types, DEFAULT_RUNTIME_POLICY.allowed_message_types),
    allowed_publish_topics: asStringArray(
      policy?.allowed_publish_topics,
      DEFAULT_RUNTIME_POLICY.allowed_publish_topics,
    ),
    allowed_recording_topics: asStringArray(
      policy?.allowed_recording_topics,
      DEFAULT_RUNTIME_POLICY.allowed_recording_topics,
    ),
    allowed_parameters: asStringArray(policy?.allowed_parameters, DEFAULT_RUNTIME_POLICY.allowed_parameters ?? []),
    allowed_service_calls: asStringArray(policy?.allowed_service_calls, DEFAULT_RUNTIME_POLICY.allowed_service_calls),
    allowed_teleop_targets: asStringArray(
      policy?.allowed_teleop_targets,
      DEFAULT_RUNTIME_POLICY.allowed_teleop_targets,
    ),
  };
}

function normalizeSchemaVersion(value: unknown): number {
  if (value === undefined) {
    return CURRENT_CONFIGURATION_SCHEMA_VERSION;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error("Configuration schema version must be a positive integer.");
  }
  if (value > CURRENT_CONFIGURATION_SCHEMA_VERSION) {
    throw new Error(
      `Configuration schema version ${value} is newer than this Bloom build ` +
        `(latest supported version: ${CURRENT_CONFIGURATION_SCHEMA_VERSION}).`,
    );
  }
  return value;
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
      moodboard_image_uri: readString(
        theme?.inspiration?.moodboard_image_uri,
        DEFAULT_THEME_INSPIRATION.moodboard_image_uri,
      ),
      reference_url: readString(theme?.inspiration?.reference_url, DEFAULT_THEME_INSPIRATION.reference_url),
    },
    preset_id: readString(theme?.preset_id, DEFAULT_APPLICATION_THEME.preset_id),
    palette: {
      accent: readString(theme?.palette?.accent, DEFAULT_APPLICATION_THEME.palette.accent),
      background: readString(theme?.palette?.background, DEFAULT_APPLICATION_THEME.palette.background),
      primary: readString(theme?.palette?.primary, DEFAULT_APPLICATION_THEME.palette.primary),
      surface: readString(theme?.palette?.surface, DEFAULT_APPLICATION_THEME.palette.surface),
    },
  };
}

function normalizeScreen(screen: PartialScreenConfig, index: number): ScreenConfig {
  const id = readString(screen.id, `screen-${index + 1}`);
  const reservedRegions = normalizeReservedRegions(screen.reserved_regions);

  return {
    id,
    title: readString(screen.title, id),
    canvas: normalizeCanvas(screen.canvas),
    widgets: (screen.widgets ?? []).map((widget, widgetIndex) => normalizeWidget(widget, widgetIndex)),
    ...(reservedRegions.length > 0 ? { reserved_regions: reservedRegions } : {}),
  };
}

function normalizeReservedRegions(regions: unknown): ReservedRegion[] {
  if (!Array.isArray(regions)) {
    return [];
  }
  return regions.flatMap((region): ReservedRegion[] => {
    if (!isRecord(region) || typeof region.id !== "string" || !region.id) {
      return [];
    }
    const [x, y, width, height] = [region.x, region.y, region.width, region.height];
    // Same bounds as the backend ReservedRegion: integer origin >= 0, integer size > 0.
    const isInteger = (value: unknown, floor: number): value is number =>
      Number.isInteger(value) && (value as number) >= floor;
    if (!isInteger(x, 0) || !isInteger(y, 0) || !isInteger(width, 1) || !isInteger(height, 1)) {
      return [];
    }
    return [
      {
        id: region.id,
        owner: "runtime-chrome",
        x,
        y,
        width,
        height,
      },
    ];
  });
}

function normalizeCanvas(canvas: Partial<CanvasSettings> | undefined): CanvasSettings {
  return {
    preset_id: isCanvasPresetId(canvas?.preset_id) ? canvas.preset_id : DEFAULT_CANVAS.preset_id,
    runtime_mode: isRuntimeCanvasMode(canvas?.runtime_mode) ? canvas.runtime_mode : DEFAULT_CANVAS.runtime_mode,
  };
}

function normalizeWidget(widget: PartialWidgetConfig, index: number): WidgetConfig {
  const id = readString(widget.id, `widget-${index + 1}`);
  const kind = isWidgetKind(widget.kind) ? widget.kind : "unknown";

  return {
    id,
    kind,
    title: readString(widget.title, id),
    layout: normalizeWidgetLayout(widget.layout),
    settings: isRecord(widget.settings) ? widget.settings : {},
  };
}

function normalizeWidgetLayout(layout: Partial<WidgetLayout> | undefined): WidgetLayout {
  return {
    x: readNumber(layout?.x, DEFAULT_WIDGET_LAYOUT.x),
    y: readNumber(layout?.y, DEFAULT_WIDGET_LAYOUT.y),
    width: readNumber(layout?.width, DEFAULT_WIDGET_LAYOUT.width),
    height: readNumber(layout?.height, DEFAULT_WIDGET_LAYOUT.height),
  };
}

function asStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
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
