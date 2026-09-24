import type { ScreenConfig, WidgetConfig } from "@bloom/api-client";
import { type DeviceClass, resolveDeviceClass } from "./canvas";
import type { WidgetDefinition, WidgetRegistry } from "./widget-definition";

/** A screen's widgets paired with their definitions, or the reason one has none. */
export type WidgetRenderContext = {
  screenId: string;
  /** The class of the screen being rendered, when the caller knows it. */
  deviceClass?: DeviceClass;
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
      deviceClass: resolveDeviceClass(screen),
    }),
  );
}
