import type {
  ApplicationConfig,
  CanvasPresetId,
  CanvasSettings,
  ConfigurationBundle,
  RuntimeCanvasMode,
  ScreenConfig,
  WidgetConfig,
  WidgetKind,
  WidgetLayout,
} from "@bloom/api-client";

type PartialConfigurationBundle = Partial<Omit<ConfigurationBundle, "applications" | "metadata">> & {
  applications?: PartialApplicationConfig[];
  metadata?: Partial<ConfigurationBundle["metadata"]>;
};

type PartialApplicationConfig = Partial<Omit<ApplicationConfig, "screens">> & {
  screens?: PartialScreenConfig[];
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
  "gauge",
  "joystick",
  "label",
  "plot",
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
    screens: (application.screens ?? []).map((screen, screenIndex) => normalizeScreen(screen, screenIndex)),
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
