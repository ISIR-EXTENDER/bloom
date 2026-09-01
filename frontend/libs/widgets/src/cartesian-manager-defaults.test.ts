import { WIDGET_KINDS } from "@bloom/api-client";
import { describe, expect, it } from "vitest";

import { getDefaultWidgetSettings } from "./settings";

/**
 * The Extender control stack moved from `sandbox_controller` to
 * `cartesian_manager`. A new teleop widget must be created bound to the manager
 * input topic, otherwise every screen built from now on quietly produces a
 * legacy configuration that publishes into a topic nothing subscribes to.
 *
 * This regressed once already: an edit to the default silently matched nothing,
 * and no test noticed because the suite only ever asserted widget behaviour.
 */
describe("cartesian_manager widget defaults", () => {
  it("creates joystick widgets bound to the cartesian_manager input topic", () => {
    const settings = getDefaultWidgetSettings("joystick") as {
      runtime_binding?: { value_mapping?: Record<string, unknown> };
    };

    expect(settings.runtime_binding?.value_mapping?.target_topic).toBe("/joystick_cartesian_command");
  });

  it("does not leave any retired topic in the default widget settings", () => {
    const retired = ["/teleop_cmd", "/sandbox_controller/velocity_command", "/activate_snake"];

    for (const kind of WIDGET_KINDS) {
      const serialized = JSON.stringify(getDefaultWidgetSettings(kind));
      for (const topic of retired) {
        expect(serialized, `${kind} default settings still reference ${topic}`).not.toContain(topic);
      }
    }
  });
});
