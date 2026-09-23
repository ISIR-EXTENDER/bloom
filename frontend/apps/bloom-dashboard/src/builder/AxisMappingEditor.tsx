import type { WidgetConfig } from "@bloom/api-client";

/** The six twist components, named as `cartesian_manager` names them. */
const TWIST_COMPONENTS = ["linear_x", "linear_y", "linear_z", "angular_x", "angular_y", "angular_z"] as const;

/** Which axes a kind offers, and what to call them on screen. */
const AXES_BY_KIND: Readonly<Record<string, readonly { key: string; label: string }[]>> = {
  joystick: [
    { key: "x", label: "Sideways (X)" },
    { key: "y", label: "Forward (Y)" },
  ],
  slider: [{ key: "value", label: "Travel" }],
};

type AxisBinding = { component?: string; scale?: number };

export function axesForKind(kind: string): readonly { key: string; label: string }[] {
  return AXES_BY_KIND[kind] ?? [];
}

function readBinding(widget: WidgetConfig): Record<string, AxisBinding> {
  const runtimeBinding = widget.settings?.runtime_binding;
  if (typeof runtimeBinding !== "object" || runtimeBinding === null) {
    return {};
  }
  const mapping = (runtimeBinding as Record<string, unknown>).axis_mapping;
  return typeof mapping === "object" && mapping !== null ? (mapping as Record<string, AxisBinding>) : {};
}

/**
 * Which twist component each axis drives, as a control rather than as JSON.
 *
 * It lives inside `runtime_binding`, which the inspector otherwise shows as a raw blob, so changing
 * what a stick moves meant hand-writing `{"x": {"component": "linear_x"}}` and knowing the schema.
 * Robin hit exactly this on the bench: the axes were wrong and the way to correct them was invisible.
 */
export function AxisMappingEditor({
  allowedCommandFrameIds,
  onUpdateSettings,
  widget,
}: {
  /** The frames this robot accepts, as the backend reports them. */
  allowedCommandFrameIds?: readonly string[];
  onUpdateSettings: (settings: Record<string, unknown>) => string | null;
  widget: WidgetConfig;
}) {
  const axes = axesForKind(widget.kind);
  const runtimeBinding = widget.settings?.runtime_binding;
  const isTeleop =
    typeof runtimeBinding === "object" &&
    runtimeBinding !== null &&
    (runtimeBinding as Record<string, unknown>).adapter === "teleop";

  if (axes.length === 0 || !isTeleop) {
    return null;
  }

  const mapping = readBinding(widget);

  const valueMapping =
    typeof (runtimeBinding as Record<string, unknown>).value_mapping === "object" &&
    (runtimeBinding as Record<string, unknown>).value_mapping !== null
      ? ((runtimeBinding as Record<string, unknown>).value_mapping as Record<string, unknown>)
      : {};
  const widgetFrameId = typeof valueMapping.frame_id === "string" ? valueMapping.frame_id : "";
  const turnsTheHand = Object.values(mapping).some((binding) => binding.component?.startsWith("angular_"));

  const updateFrame = (frameId: string) => {
    const base = runtimeBinding as Record<string, unknown>;
    const nextValueMapping = { ...valueMapping };
    if (frameId) {
      nextValueMapping.frame_id = frameId;
    } else {
      delete nextValueMapping.frame_id;
    }
    onUpdateSettings({ ...widget.settings, runtime_binding: { ...base, value_mapping: nextValueMapping } });
  };

  const update = (axisKey: string, patch: AxisBinding) => {
    const base = runtimeBinding as Record<string, unknown>;
    onUpdateSettings({
      ...widget.settings,
      runtime_binding: {
        ...base,
        axis_mapping: {
          ...mapping,
          [axisKey]: { ...(mapping[axisKey] ?? {}), ...patch },
        },
      },
    });
  };

  return (
    <fieldset className="builder-axis-mapping">
      <legend>What this moves</legend>
      {turnsTheHand ? (
        <div className="builder-axis-row">
          <label>
            {/* The frame rotates only the angular part, so it is offered where a pad turns the hand. */}
            <span>Turns in</span>
            <select onChange={(event) => updateFrame(event.target.value)} value={widgetFrameId}>
              <option value="">The app's frame</option>
              {(allowedCommandFrameIds ?? []).map((frameId) => (
                <option key={frameId} value={frameId}>
                  {frameId}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
      {axes.map((axis) => {
        const binding = mapping[axis.key] ?? {};
        return (
          <div className="builder-axis-row" key={axis.key}>
            <label>
              <span>{axis.label}</span>
              <select
                onChange={(event) => update(axis.key, { component: event.target.value })}
                value={binding.component ?? ""}
              >
                <option value="">Nothing</option>
                {TWIST_COMPONENTS.map((component) => (
                  <option key={component} value={component}>
                    {component}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {/* -1 is how Pivot reads left as a left turn; it is a direction, not a speed. */}
              <span>Invert</span>
              <select
                onChange={(event) => update(axis.key, { scale: Number(event.target.value) })}
                value={String(binding.scale ?? 1)}
              >
                <option value="1">No</option>
                <option value="-1">Yes</option>
              </select>
            </label>
          </div>
        );
      })}
    </fieldset>
  );
}
