import {
  type ApplicationConfig,
  type ConfigurationBundle,
  DEFAULT_APPLICATION_THEME,
  type ScreenConfig,
} from "@bloom/api-client";
import { describe, expect, it } from "vitest";

import {
  addScreenToApplication,
  createUniqueId,
  duplicateApplicationInConfigurationBundle,
  duplicateScreenInApplication,
  removeScreenFromApplication,
  replaceScreenInConfigurationBundle,
} from "./configuration-editor";

describe("duplicateApplicationInConfigurationBundle", () => {
  it("duplicates an app with a stable unique id and cloned screens", () => {
    const bundle = createBundle();

    const duplicatedApplication = duplicateApplicationInConfigurationBundle(bundle, "sandbox");

    expect(duplicatedApplication).toMatchObject({
      id: "sandbox-copy",
      name: "Sandbox Copy",
    });
    expect(duplicatedApplication.screens).toEqual(bundle.applications[0]?.screens);
    expect(duplicatedApplication.screens).not.toBe(bundle.applications[0]?.screens);
  });

  it("increments duplicate app ids when a copy already exists", () => {
    const baseBundle = createBundle();
    const baseApplication = baseBundle.applications[0];

    if (!baseApplication) {
      throw new Error("Test application is missing.");
    }

    const bundle = {
      ...baseBundle,
      applications: [
        ...baseBundle.applications,
        {
          ...baseApplication,
          id: "sandbox-copy",
          name: "Sandbox Copy",
        } as ApplicationConfig,
      ],
    };

    const duplicatedApplication = duplicateApplicationInConfigurationBundle(bundle, "sandbox");

    expect(duplicatedApplication.id).toBe("sandbox-copy-2");
  });

  it("fails explicitly when the duplicated app is missing", () => {
    expect(() => duplicateApplicationInConfigurationBundle(createBundle(), "missing")).toThrow(
      'Application "missing" was not found in the selected configuration.',
    );
  });
});

describe("addScreenToApplication", () => {
  it("adds a cloned screen without mutating the source application", () => {
    const application = createBundle().applications[0];
    const screenToAdd = createScreen("camera");

    if (!application) {
      throw new Error("Test application is missing.");
    }

    const updatedApplication = addScreenToApplication(application, screenToAdd);

    expect(updatedApplication.screens).toHaveLength(3);
    expect(updatedApplication.screens.at(-1)).toEqual(screenToAdd);
    expect(updatedApplication.screens.at(-1)).not.toBe(screenToAdd);
    expect(application.screens).toHaveLength(2);
  });

  it("fails explicitly when the screen already belongs to the application", () => {
    const application = createBundle().applications[0];

    if (!application) {
      throw new Error("Test application is missing.");
    }

    expect(() => addScreenToApplication(application, createScreen("main"))).toThrow(
      'Screen "main" already exists in application "sandbox".',
    );
  });
});

describe("removeScreenFromApplication", () => {
  it("removes one screen while preserving the rest of the application", () => {
    const application = createBundle().applications[0];

    if (!application) {
      throw new Error("Test application is missing.");
    }

    const updatedApplication = removeScreenFromApplication(application, "diagnostics");

    expect(updatedApplication.screens).toEqual([createScreen("main")]);
    expect(application.screens).toHaveLength(2);
  });

  it("keeps at least one screen in the application", () => {
    const application = {
      ...createBundle().applications[0],
      screens: [createScreen("main")],
    };

    expect(() => removeScreenFromApplication(application, "main")).toThrow(
      'Application "sandbox" must keep at least one screen.',
    );
  });

  it("fails explicitly when the screen is missing", () => {
    const application = createBundle().applications[0];

    if (!application) {
      throw new Error("Test application is missing.");
    }

    expect(() => removeScreenFromApplication(application, "missing")).toThrow(
      'Screen "missing" was not found in application "sandbox".',
    );
  });
});

describe("duplicateScreenInApplication", () => {
  it("duplicates a screen with a stable unique id and copied widgets", () => {
    const application = createBundle().applications[0];

    if (!application) {
      throw new Error("Test application is missing.");
    }

    const updatedApplication = duplicateScreenInApplication(application, "main");
    const duplicatedScreen = updatedApplication.screens.at(-1);

    expect(duplicatedScreen).toMatchObject({
      id: "main-copy",
      title: "Main Copy",
    });
    expect(duplicatedScreen?.widgets).toEqual(application.screens[0]?.widgets);
    expect(duplicatedScreen?.widgets).not.toBe(application.screens[0]?.widgets);
    expect(application.screens).toHaveLength(2);
  });

  it("increments duplicate ids when a copy already exists", () => {
    const application = {
      ...createBundle().applications[0],
      screens: [createScreen("main"), createScreen("main-copy")],
    };

    const updatedApplication = duplicateScreenInApplication(application, "main");

    expect(updatedApplication.screens.at(-1)?.id).toBe("main-copy-2");
  });

  it("fails explicitly when the duplicated screen is missing", () => {
    const application = createBundle().applications[0];

    if (!application) {
      throw new Error("Test application is missing.");
    }

    expect(() => duplicateScreenInApplication(application, "missing")).toThrow(
      'Screen "missing" was not found in application "sandbox".',
    );
  });
});

describe("createUniqueId", () => {
  it("slugifies labels into ids", () => {
    expect(createUniqueId("Live Teleop Screen", [])).toBe("live-teleop-screen");
  });

  it("falls back to a screen id and increments existing ids", () => {
    expect(createUniqueId("!!!", ["screen", "screen-2"])).toBe("screen-3");
  });
});

describe("replaceScreenInConfigurationBundle", () => {
  it("replaces one screen while preserving the rest of the bundle", () => {
    const replacementScreen: ScreenConfig = {
      ...createScreen("main"),
      title: "Updated main",
      widgets: [
        {
          id: "button",
          kind: "button",
          title: "Start",
          layout: { x: 16, y: 24, width: 120, height: 80 },
          settings: {},
        },
      ],
    };

    const updatedBundle = replaceScreenInConfigurationBundle(createBundle(), "sandbox", replacementScreen);

    expect(updatedBundle.applications[0]?.screens[0]).toEqual(replacementScreen);
    expect(updatedBundle.applications[0]?.screens[1]).toEqual(createScreen("diagnostics"));
    expect(updatedBundle.metadata).toEqual(createBundle().metadata);
  });

  it("fails explicitly when the application is missing", () => {
    expect(() => replaceScreenInConfigurationBundle(createBundle(), "missing", createScreen("main"))).toThrow(
      'Application "missing" was not found in the selected configuration.',
    );
  });

  it("fails explicitly when the screen is missing", () => {
    expect(() => replaceScreenInConfigurationBundle(createBundle(), "sandbox", createScreen("missing"))).toThrow(
      'Screen "missing" was not found in application "sandbox".',
    );
  });
});

function createBundle(): ConfigurationBundle {
  return {
    metadata: {
      schema_version: 1,
      exported_at: "2026-06-01T14:00:00Z",
      source: "dashboard-test",
    },
    applications: [
      {
        id: "sandbox",
        name: "Sandbox",
        description: "Sandbox operator interface",
        theme: DEFAULT_APPLICATION_THEME,
        screens: [createScreen("main"), createScreen("diagnostics")],
      },
    ],
  };
}

function createScreen(id: string): ScreenConfig {
  return {
    id,
    title: id === "main" ? "Main" : "Diagnostics",
    canvas: { preset_id: "hd", runtime_mode: "fit" },
    widgets: [],
  };
}
