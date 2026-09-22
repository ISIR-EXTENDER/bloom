import { normalizeWidgetSettings } from "@bloom/widgets";
import { describe, expect, it } from "vitest";

import { createStarterScreen, type StarterScreenId } from "./BuilderHome";

const STARTERS: StarterScreenId[] = ["blank", "operator-control", "debug-monitor"];

/**
 * A starter screen is what someone authoring without help begins from, so it has to be true.
 */
describe("the starter screens", () => {
  it.each(STARTERS)("reserves STOP's box on %s", (starterId) => {
    const screen = createStarterScreen(starterId, false);

    expect(screen.reserved_regions?.some((region) => region.id === "stop")).toBe(true);
  });

  it("publishes where the operator starter says it does", () => {
    const screen = createStarterScreen("operator-control", false);
    const joystick = screen.widgets.find((widget) => widget.kind === "joystick");
    const normalized = normalizeWidgetSettings("joystick", joystick?.settings ?? {});

    expect(normalized.success).toBe(true);
    if (!normalized.success) return;
    const binding = normalized.settings.runtime_binding as { value_mapping?: { target_topic?: string } };
    // Written in camelCase these keys were dropped, and the starter published somewhere it never named.
    expect(binding.value_mapping?.target_topic).toBe("/joystick_cartesian_command");
    expect(Object.keys(joystick?.settings ?? {})).not.toContain("runtimeBinding");
  });
});
