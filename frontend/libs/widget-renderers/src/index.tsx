import type { WidgetKind } from "@bloom/api-client";
import type { WidgetRenderDescriptor } from "@bloom/widgets";
import type { ReactNode } from "react";
import { DEFAULT_WIDGET_RENDERERS } from "./default-registry";
import { UnknownWidget } from "./fallback-renderers";
import type {
  ScreenRendererOptions,
  WidgetRenderer,
  WidgetRendererRegistration,
  WidgetRendererRegistry,
} from "./types";
import { WidgetFrame } from "./WidgetFrame";

export { resolveDecimalPlaces, resolveJoystickControlSize } from "./control-renderers";
export type { JoystickLabels, JoystickPrimitiveProps, JoystickVector } from "./JoystickPrimitive";
export { JoystickPrimitive, normalizeJoystickVector } from "./JoystickPrimitive";
export type {
  ScreenRendererOptions,
  UnknownWidgetRenderer,
  UnknownWidgetRendererProps,
  WidgetActionIntentHandler,
  WidgetControlState,
  WidgetDataSnapshot,
  WidgetRenderer,
  WidgetRendererProps,
  WidgetRendererRegistration,
  WidgetRendererRegistry,
} from "./types";

export function createWidgetRendererRegistry(
  registrations: readonly WidgetRendererRegistration[] = DEFAULT_WIDGET_RENDERERS,
): WidgetRendererRegistry {
  const registry = new Map<WidgetKind, WidgetRenderer>();

  for (const registration of registrations) {
    if (registry.has(registration.kind)) {
      throw new Error(`Duplicate widget renderer for kind "${registration.kind}".`);
    }
    registry.set(registration.kind, registration.render);
  }

  return registry;
}

export function renderWidgetDescriptor(
  descriptor: WidgetRenderDescriptor,
  options: ScreenRendererOptions = {},
): ReactNode {
  if (descriptor.status === "unknown") {
    const renderUnknown = options.renderUnknown ?? UnknownWidget;
    return renderUnknown({ descriptor });
  }

  const registry = options.registry ?? createWidgetRendererRegistry();
  const renderer = registry.get(descriptor.definition.kind);
  if (!renderer) {
    return (
      <UnknownWidget
        descriptor={{
          status: "unknown",
          widget: descriptor.widget,
          context: descriptor.context,
          reason: `No React renderer registered for kind "${descriptor.definition.kind}".`,
        }}
      />
    );
  }

  const Renderer = renderer;
  return (
    <Renderer
      controlState={options.controlStateByWidgetId?.[descriptor.widget.id]}
      data={options.dataByWidgetId?.[descriptor.widget.id]}
      descriptor={descriptor}
      onActionIntent={options.onActionIntent}
    />
  );
}

export function renderScreenWidgets(
  descriptors: readonly WidgetRenderDescriptor[],
  options: ScreenRendererOptions = {},
): ReactNode[] {
  return descriptors.map((descriptor) => (
    <WidgetFrame descriptor={descriptor} key={descriptor.widget.id}>
      {renderWidgetDescriptor(descriptor, options)}
    </WidgetFrame>
  ));
}
