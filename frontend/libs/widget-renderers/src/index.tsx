import type { WidgetKind } from "@bloom/api-client";
import { localizeWidget, type WidgetRenderDescriptor } from "@bloom/widgets";
import type { ReactNode } from "react";
import { DEFAULT_WIDGET_RENDERERS } from "./default-registry";
import { UnknownWidget } from "./fallback-renderers";
import type {
  ScreenRendererOptions,
  WidgetRenderer,
  WidgetRendererRegistration,
  WidgetRendererRegistry,
} from "./types";
import { WidgetBoundary } from "./WidgetBoundary";
import { WidgetFrame } from "./WidgetFrame";

export { resolveJoystickControlSize, resolveTitlePlacement } from "@bloom/widgets";
export type {
  PlotSeriesSnapshot,
  ScreenRendererOptions,
  WidgetActionIntentHandler,
  WidgetActionOutcome,
  WidgetControlState,
  WidgetDataSnapshot,
  WidgetRendererRegistration,
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
  const localized =
    options.language && options.language !== "en"
      ? { ...descriptor, widget: localizeWidget(descriptor.widget, options.language) }
      : descriptor;
  return (
    <Renderer
      conditioning={options.conditioning}
      controlState={options.controlStateByWidgetId?.[descriptor.widget.id]}
      data={options.dataByWidgetId?.[descriptor.widget.id]}
      descriptor={localized}
      language={options.language}
      motorPreset={options.motorPreset}
      neutralRevision={options.neutralRevision}
      onActionIntent={options.onActionIntent}
    />
  );
}

export function renderScreenWidgets(
  descriptors: readonly WidgetRenderDescriptor[],
  options: ScreenRendererOptions = {},
): ReactNode[] {
  return descriptors.map((descriptor) => {
    const controlState = options.controlStateByWidgetId?.[descriptor.widget.id];
    return (
      <WidgetFrame controlState={controlState} descriptor={descriptor} key={descriptor.widget.id}>
        <WidgetBoundary title={descriptor.widget.title}>{renderWidgetDescriptor(descriptor, options)}</WidgetBoundary>
      </WidgetFrame>
    );
  });
}
