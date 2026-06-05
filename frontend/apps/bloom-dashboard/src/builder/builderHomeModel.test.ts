import {
  type ApplicationConfig,
  DEFAULT_APPLICATION_THEME,
  DEFAULT_RUNTIME_POLICY,
  type ScreenConfig,
  type WidgetKind,
} from "@bloom/api-client";
import { describe, expect, it } from "vitest";
import type { LoadedConfiguration } from "../configurations/configuration-loader";
import {
  classifyScreen,
  createBuilderApplicationItems,
  createNewApplicationName,
  createScreenLibraryItems,
  filterScreens,
  formatScreenTitle,
  groupScreensByType,
  selectPlaygroundScreens,
  slugify,
} from "./builderHomeModel";

describe("builderHomeModel", () => {
  it("formats legacy screen ids into readable titles", () => {
    expect(formatScreenTitle("default_live_teleop")).toBe("Default Live Teleop");
    expect(formatScreenTitle("camera-hd-ros-ui")).toBe("Camera HD ROS UI");
    expect(formatScreenTitle("")).toBe("Untitled Screen");
  });

  it("classifies screen library items from widget families and screen intent", () => {
    expect(classifyScreen(createScreen({ id: "camera", widgets: [{ kind: "camera" }] }))).toBe("camera");
    expect(classifyScreen(createScreen({ id: "drive", widgets: [{ kind: "joystick" }] }))).toBe("control");
    expect(classifyScreen(createScreen({ id: "topic-monitor", widgets: [{ kind: "topic-echo" }] }))).toBe("debug");
    expect(classifyScreen(createScreen({ id: "operator-events", widgets: [{ kind: "event-log" }] }))).toBe("debug");
    expect(classifyScreen(createScreen({ id: "gripper", widgets: [] }))).toBe("device");
    expect(classifyScreen(createScreen({ id: "petanque-setup", widgets: [] }))).toBe("workflow");
    expect(classifyScreen(createScreen({ id: "overview", widgets: [] }))).toBe("general");
  });

  it("creates, filters, and groups reusable screens from configurations", () => {
    const configurations = [
      createLoadedConfiguration({
        id: "sandbox",
        applications: [
          createApplication({
            id: "sandbox-lab",
            name: "Sandbox Lab",
            screens: [
              createScreen({ id: "default_live_teleop", widgets: [{ kind: "joystick" }] }),
              createScreen({ id: "logs", widgets: [{ kind: "topic-echo" }] }),
            ],
          }),
        ],
      }),
    ];

    const applications = createBuilderApplicationItems(configurations);
    const screens = createScreenLibraryItems(applications);
    const filteredScreens = filterScreens(screens, "teleop");
    const groups = groupScreensByType(screens);

    expect(applications).toHaveLength(1);
    expect(screens.map((screen) => screen.displayTitle)).toEqual(["Default Live Teleop", "Logs"]);
    expect(filteredScreens).toHaveLength(1);
    expect(filteredScreens[0]?.type).toBe("control");
    expect(groups.map((group) => group.definition.type)).toEqual(["control", "debug"]);
  });

  it("selects camera, debug, then control screens for the playground", () => {
    const application = createApplication({
      id: "demo",
      name: "Demo",
      screens: [
        createScreen({ id: "drive", widgets: [{ kind: "joystick" }] }),
        createScreen({ id: "camera", widgets: [{ kind: "camera" }] }),
        createScreen({ id: "topics", widgets: [{ kind: "topic-plot" }] }),
      ],
    });
    const screens = createScreenLibraryItems([
      { application, configuration: createLoadedConfiguration({ id: "demo", applications: [application] }) },
    ]);

    expect(selectPlaygroundScreens(screens).map((screen) => screen.type)).toEqual(["camera", "debug", "control"]);
  });

  it("generates stable starter app names and ids", () => {
    expect(createNewApplicationName([])).toBe("New Bloom App");
    expect(
      createNewApplicationName([
        createApplication({ id: "new-bloom-app", name: "New Bloom App", screens: [] }),
        createApplication({ id: "new-bloom-app-2", name: "New Bloom App 2", screens: [] }),
      ]),
    ).toBe("New Bloom App 3");
    expect(slugify("  My ROS App!  ")).toBe("my-ros-app");
    expect(slugify("!!!")).toBe("bloom-app");
  });
});

function createLoadedConfiguration({
  applications,
  id,
}: {
  applications: ApplicationConfig[];
  id: string;
}): LoadedConfiguration {
  return {
    bundle: {
      applications,
      metadata: { exported_at: "2026-06-04T00:00:00Z", schema_version: 1, source: "test" },
    },
    id,
  };
}

function createApplication({
  id,
  name,
  screens,
}: {
  id: string;
  name: string;
  screens: ScreenConfig[];
}): ApplicationConfig {
  return {
    description: "",
    id,
    name,
    profiles: [],
    runtime_policy: DEFAULT_RUNTIME_POLICY,
    screens,
    theme: DEFAULT_APPLICATION_THEME,
  };
}

function createScreen({ id, widgets }: { id: string; widgets: Array<{ kind: WidgetKind }> }): ScreenConfig {
  return {
    canvas: { preset_id: "tablet", runtime_mode: "fit" },
    id,
    title: id,
    widgets: widgets.map((widget, index) => ({
      id: `${widget.kind}-${index}`,
      kind: widget.kind,
      layout: { height: 100, width: 100, x: 0, y: 0 },
      settings: {},
      title: widget.kind,
    })),
  };
}
