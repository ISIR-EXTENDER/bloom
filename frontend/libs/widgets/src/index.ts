import type { ScreenConfig, WidgetConfig, WidgetKind } from "@bloom/api-client";

export type WidgetRenderContext = {
  screenId: string;
};

export type WidgetRenderDescriptor =
  | {
      status: "resolved";
      widget: WidgetConfig;
      definition: WidgetDefinition;
      context: WidgetRenderContext;
    }
  | {
      status: "unknown";
      widget: WidgetConfig;
      context: WidgetRenderContext;
      reason: string;
    };

export type WidgetDefinition = {
  kind: WidgetKind;
  displayName: string;
};

export type WidgetRegistry = ReadonlyMap<WidgetKind, WidgetDefinition>;

export function createWidgetRegistry(definitions: Iterable<WidgetDefinition> = []): WidgetRegistry {
  const registry = new Map<WidgetKind, WidgetDefinition>();

  for (const definition of definitions) {
    if (registry.has(definition.kind)) {
      throw new Error(`Duplicate widget definition for kind "${definition.kind}".`);
    }
    registry.set(definition.kind, definition);
  }

  return registry;
}

export function renderWidgetDescriptor(
  widget: WidgetConfig,
  registry: WidgetRegistry,
  context: WidgetRenderContext,
): WidgetRenderDescriptor {
  const definition = registry.get(widget.kind);
  if (!definition) {
    return {
      status: "unknown",
      widget,
      context,
      reason: `No widget definition registered for kind "${widget.kind}".`,
    };
  }

  return {
    status: "resolved",
    widget,
    definition,
    context,
  };
}

export function renderScreenDescriptors(screen: ScreenConfig, registry: WidgetRegistry): WidgetRenderDescriptor[] {
  return screen.widgets.map((widget) =>
    renderWidgetDescriptor(widget, registry, {
      screenId: screen.id,
    }),
  );
}
