import type { UnknownWidgetRendererProps, WidgetRendererProps } from "./types";

export function PlaceholderWidget({ descriptor }: WidgetRendererProps) {
  return (
    <>
      <strong>{descriptor.widget.title}</strong>
      <span>{descriptor.definition.displayName}</span>
    </>
  );
}

export function UnknownWidget({ descriptor }: UnknownWidgetRendererProps) {
  return (
    <>
      <strong>{descriptor.widget.title}</strong>
      <span>{descriptor.reason}</span>
    </>
  );
}
