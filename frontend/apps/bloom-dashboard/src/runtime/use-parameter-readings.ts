import type { ScreenConfig } from "@bloom/api-client";
import { useEffect, useState } from "react";

import type { RuntimeActionClient } from "./runtime-action-dispatcher";

type ParameterBinding = { node: string; parameter: string; widgetId: string };

/** The parameter sliders on a screen, so they can open on what the node holds. */
function resolveParameterBindings(screen: ScreenConfig): ParameterBinding[] {
  return screen.widgets.flatMap((widget) => {
    const binding = widget.settings?.runtime_binding;
    if (!binding || typeof binding !== "object" || (binding as { adapter?: unknown }).adapter !== "parameter") {
      return [];
    }
    const mapping = (binding as { value_mapping?: unknown }).value_mapping;
    if (!mapping || typeof mapping !== "object") {
      return [];
    }
    const { node, parameter } = mapping as { node?: unknown; parameter?: unknown };
    return typeof node === "string" && typeof parameter === "string" ? [{ node, parameter, widgetId: widget.id }] : [];
  });
}

/**
 * Live values for the screen's parameter bindings, read once per screen open. A value the node does
 * not hold, or a backend without ROS, leaves the slider on its seed value; nothing is invented.
 */
export function useParameterReadings(screen: ScreenConfig, client: RuntimeActionClient): Record<string, number> {
  const [readings, setReadings] = useState<Record<string, number>>({});
  const getRosParameters = client.getRosParameters;

  useEffect(() => {
    const bindings = resolveParameterBindings(screen);
    setReadings({});
    if (!getRosParameters || bindings.length === 0) {
      return;
    }
    let cancelled = false;
    const byNode = new Map<string, ParameterBinding[]>();
    for (const binding of bindings) {
      byNode.set(binding.node, [...(byNode.get(binding.node) ?? []), binding]);
    }
    for (const [node, nodeBindings] of byNode) {
      getRosParameters(
        node,
        nodeBindings.map((binding) => binding.parameter),
      )
        .then((values) => {
          if (cancelled) {
            return;
          }
          const next: Record<string, number> = {};
          for (const reading of values) {
            const binding = nodeBindings.find((candidate) => candidate.parameter === reading.name);
            if (binding && typeof reading.value === "number") {
              next[binding.widgetId] = reading.value;
            }
          }
          setReadings((current) => ({ ...current, ...next }));
        })
        .catch(() => {
          // The slider keeps its seed value; the set path reports its own refusal.
        });
    }
    return () => {
      cancelled = true;
    };
  }, [screen, getRosParameters]);

  return readings;
}
