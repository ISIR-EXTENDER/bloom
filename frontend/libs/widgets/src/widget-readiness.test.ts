import { describe, expect, it } from "vitest";

import { DEFAULT_WIDGET_DEFINITIONS } from "./index";
import { describeUnavailableWidgetRuntime, type RuntimeCapability, resolveWidgetReadiness } from "./widget-readiness";

const WITH_ROS: RuntimeCapability[] = [
  { id: "command-dispatcher", available: true, detail: "" },
  { id: "data-source", available: true, detail: "" },
  { id: "teleop-adapter", available: true, detail: "" },
];
const WITHOUT_ROS: RuntimeCapability[] = WITH_ROS.map((capability) => ({ ...capability, available: false }));

function definition(kind: string) {
  const found = DEFAULT_WIDGET_DEFINITIONS.find((candidate) => candidate.kind === kind);
  if (!found) throw new Error(`no definition for ${kind}`);
  return found;
}

describe("with the backend fully wired", () => {
  it("calls a joystick ready", () => {
    expect(resolveWidgetReadiness(definition("joystick"), WITH_ROS).state).toBe("ready");
  });

  it("still calls the 3D robot view a preview, because that is about the widget", () => {
    const readiness = resolveWidgetReadiness(definition("robot-3d"), WITH_ROS);

    expect(readiness.state).toBe("preview");
    expect(readiness.note).toMatch(/not a 3D model/);
  });
});

describe("with no ROS attached", () => {
  it("marks a joystick unavailable and says what it needs", () => {
    const readiness = resolveWidgetReadiness(definition("joystick"), WITHOUT_ROS);

    expect(readiness.state).toBe("unavailable");
    expect(readiness.note).toMatch(/teleop connection/);
    expect(readiness.missing).toEqual(["teleop-adapter"]);
  });

  it("uses the backend's concrete runtime failure detail", () => {
    const capabilities = WITHOUT_ROS.map((capability) =>
      capability.id === "teleop-adapter"
        ? { ...capability, detail: "No teleop gateway is connected, so axis widgets move nothing." }
        : capability,
    );
    const readiness = resolveWidgetReadiness(definition("joystick"), capabilities);

    expect(describeUnavailableWidgetRuntime(readiness, capabilities)).toBe(
      "No teleop gateway is connected, so axis widgets move nothing.",
    );
  });

  it("falls back to the requirement name when an older report omits it", () => {
    const readiness = resolveWidgetReadiness(definition("joystick"), []);

    expect(describeUnavailableWidgetRuntime(readiness, [])).toBe("Needs a teleop connection to the manager.");
  });

  it("says a widget can still be placed, since a screen is often built before the robot is on", () => {
    expect(resolveWidgetReadiness(definition("plot"), WITHOUT_ROS).note).toMatch(/can be placed now/);
  });

  it("leaves widgets that need nothing alone", () => {
    for (const kind of ["label", "camera"]) {
      expect(resolveWidgetReadiness(definition(kind), WITHOUT_ROS).state).toBe("ready");
    }
  });
});

describe("before the capabilities are known", () => {
  it("says unknown rather than claiming the widget is broken", () => {
    const readiness = resolveWidgetReadiness(definition("joystick"), null);

    expect(readiness.state).toBe("unknown");
    expect(readiness.note).toBeNull();
  });

  it("still resolves widgets that need nothing", () => {
    expect(resolveWidgetReadiness(definition("label"), null).state).toBe("ready");
  });
});

describe("every shipped definition", () => {
  it("declares only requirements the backend can report", () => {
    const reportable = new Set(["none", "command-dispatcher", "data-source", "teleop-adapter"]);

    for (const candidate of DEFAULT_WIDGET_DEFINITIONS) {
      for (const requirement of candidate.runtimeRequirements) {
        expect(reportable.has(requirement), `${candidate.kind} declares ${requirement}`).toBe(true);
      }
    }
  });

  it("explains itself whenever it is only a preview", () => {
    for (const candidate of DEFAULT_WIDGET_DEFINITIONS) {
      if (candidate.maturity === "preview") {
        expect(candidate.maturityNote, `${candidate.kind} is preview with no note`).toBeTruthy();
      }
    }
  });
});
