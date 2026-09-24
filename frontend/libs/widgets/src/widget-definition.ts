import type { WidgetKind, WidgetLayout } from "@bloom/api-client";

/** What a widget kind promises the palette, the inspector and the runtime. */
export type WidgetCategory = "command" | "device" | "display" | "feedback" | "input" | "unknown";

/**
 * A backend seam a widget needs before it can do anything.
 *
 * These are the seams the backend actually reports at
 * `GET /api/v1/capabilities`, and nothing else. The list used to include
 * `device-adapter`, `robot-model-source` and `stream-source`, which no code
 * implemented and nothing consumed, so widgets declared needs that could never
 * be met or checked. A requirement that cannot be resolved is worse than none:
 * it reads like a promise.
 */
export type WidgetRuntimeRequirement =
  | "none"
  | "command-dispatcher"
  | "data-source"
  | "service-dispatcher"
  | "teleop-adapter";

/**
 * How finished a widget is, independent of whether the backend can serve it.
 *
 * `ready` does what its description says. `preview` renders and is safe to
 * place, but does less than the name suggests -- the 3D robot view draws a
 * joint summary rather than a model. Saying so in the builder is cheaper than
 * a researcher discovering it mid-session.
 */
export type WidgetMaturity = "preview" | "ready";

export type WidgetAvailability = {
  editor: boolean;
  runtime: boolean;
};

export type WidgetDefaultLayout = {
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
};

export type WidgetStyleCapability = "accentColor" | "backgroundColor" | "borderColor" | "textColor";

export type WidgetEditorCapabilities = {
  movable: boolean;
  resizable: boolean;
  settings: boolean;
  styleFields: WidgetStyleCapability[];
};

export const DEFAULT_WIDGET_LAYOUT: WidgetLayout = {
  x: 0,
  y: 0,
  width: 160,
  height: 80,
};

export type WidgetDefinition = {
  kind: WidgetKind;
  displayName: string;
  category: WidgetCategory;
  description: string;
  defaultTitle: string;
  defaultSettings: Record<string, unknown>;
  defaultLayout: WidgetDefaultLayout;
  runtimeRequirements: WidgetRuntimeRequirement[];
  maturity: WidgetMaturity;
  /** Set when maturity is `preview`: what it does not do yet. */
  maturityNote?: string;
  availability: WidgetAvailability;
  editor: WidgetEditorCapabilities;
};

export type WidgetRegistry = ReadonlyMap<WidgetKind, WidgetDefinition>;
