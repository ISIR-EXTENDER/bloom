import type { ApplicationConfig } from "@bloom/api-client";
import { describe, expect, it } from "vitest";
import petanqueAdmin from "../../../../backend/seed/applications/petanque-admin.json";
import sandbox from "../../../../backend/seed/applications/sandbox.json";
import widgetLab from "../../../../backend/seed/applications/widget-lab.json";
import { withRobotGripper } from "./gripper";

const TOPIC = "/gripper_controller/commands";
const SEEDS = { "Petanque admin": petanqueAdmin, Sandbox: sandbox, "Widget Lab": widgetLab };

function appOf(seed: unknown): ApplicationConfig {
  const document = seed as { applications?: ApplicationConfig[] };
  return (document.applications?.[0] ?? seed) as ApplicationConfig;
}

/** Every value the app sends on the gripper topic, as "open"/"closed" by the widget's own state labels. */
function gripperValues(application: ApplicationConfig) {
  const toggles = application.screens
    .flatMap((screen) => screen.widgets)
    .filter((widget) => widget.settings.topic === TOPIC)
    .map((widget) => ({ closed: widget.settings.onPayload, open: widget.settings.offPayload }));
  const presets = application.action_presets.filter((preset) => preset.topic === TOPIC).map((preset) => preset.payload);
  return { presets, toggles };
}

describe("a gripper control follows the arm it runs on", () => {
  for (const [name, seed] of Object.entries(SEEDS)) {
    it(`${name}: Kinova 0.8 closed / 0.0 open, Explorer 1.1 / 0.2`, () => {
      const shipped = gripperValues(appOf(seed));
      expect(shipped.toggles.length).toBeGreaterThan(0);
      const kinova = gripperValues(withRobotGripper(appOf(seed), "Kinova"));
      for (const toggle of kinova.toggles) {
        expect(toggle).toEqual({ closed: "{data: [0.8]}", open: "{data: [0.0]}" });
      }
      const explorer = gripperValues(withRobotGripper(appOf(seed), "Explorer"));
      for (const toggle of explorer.toggles) {
        expect(toggle).toEqual({ closed: "{data: [1.1]}", open: "{data: [0.2]}" });
      }
    });
  }

  it("moves a stored preset's value too: Petanque admin's open preset opens a Robotiq fully", () => {
    expect(gripperValues(appOf(petanqueAdmin)).presets).toEqual([{ data: [0.2] }]);
    expect(gripperValues(withRobotGripper(appOf(petanqueAdmin), "Kinova Gen3")).presets).toEqual([{ data: [0] }]);
  });

  it("keeps an author's own values, other topics, and every app on an unknown robot", () => {
    const app = {
      action_presets: [],
      screens: [
        {
          widgets: [
            { settings: { topic: TOPIC, onPayload: "{data: [0.5]}", offPayload: "{data: [0.1]}" } },
            { settings: { topic: "/mode_request", onPayload: "{data: [1.1]}" } },
          ],
        },
      ],
    } as unknown as ApplicationConfig;
    expect(withRobotGripper(app, "Kinova")).toEqual(app);
    expect(withRobotGripper(appOf(widgetLab), undefined)).toBe(appOf(widgetLab));
    expect(withRobotGripper(appOf(widgetLab), "turtlebot")).toBe(appOf(widgetLab));
  });
});
