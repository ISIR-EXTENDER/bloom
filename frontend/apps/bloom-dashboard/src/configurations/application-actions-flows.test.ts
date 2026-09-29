import { type ApplicationConfig, BloomApiError, type ConfigurationBundle, type ScreenConfig } from "@bloom/api-client";
import { describe, expect, it } from "vitest";
import type { BloomRoute } from "../ui/navigationRoute";
import { createApplicationActions } from "./application-actions";
import type { ConfigurationClient } from "./configuration-client";
import type { ConfigurationLoadState } from "./use-configurations";

const app = (id: string, screens = ["main"]) =>
  ({ id, name: `App ${id}`, screens: screens.map((screenId) => ({ id: screenId })) }) as unknown as ApplicationConfig;
const bundle = (...applications: ApplicationConfig[]) =>
  ({ metadata: {}, applications }) as unknown as ConfigurationBundle;

/** A ready configuration store that records what the Builder writes, and a server that knows some ids. */
function harness(
  options: { serverIds?: string[]; selection?: { configId: string; appId: string; screenId: string } | null } = {},
) {
  const writes: string[] = [];
  const navigations: BloomRoute[] = [];
  const selections: unknown[] = [];
  const state = {
    status: "ready",
    configurations: [{ id: "lab", bundle: bundle(app("ops", ["home", "arm"]), app("debug")) }],
    shareStatus: {},
    saveScreen: async (configId: string, appId: string, screen: ScreenConfig) => {
      writes.push(`screen ${configId}/${appId}/${screen.id}`);
    },
    saveApplication: async (configId: string, application: ApplicationConfig) => {
      writes.push(`app ${configId}/${application.id}`);
    },
    saveConfiguration: async (configId: string, saved: ConfigurationBundle) => {
      writes.push(`config ${configId}:${saved.applications.map((item) => item.id).join(",")}`);
    },
    deleteApplication: async (configId: string, appId: string) => {
      writes.push(`delete ${configId}/${appId}`);
      const remaining = bundle(...(appId === "ops" ? [app("debug")] : []));
      return { id: configId, bundle: remaining };
    },
  } as unknown as ConfigurationLoadState;
  const client = {
    getConfiguration: async (id: string) => {
      if (!(options.serverIds ?? []).includes(id)) throw new BloomApiError("Not found", 404, "");
      return bundle();
    },
    uploadThemeAsset: async (
      configId: string,
      upload: { filename: string; content_type: string; content_base64: string },
    ) => ({
      uri: `bloom-asset://${configId}/${upload.filename}#${upload.content_type}#${upload.content_base64}`,
    }),
  } as unknown as ConfigurationClient;
  const actions = createApplicationActions({
    configurationClient: client,
    configurationState: state,
    navigate: (route) => navigations.push(route),
    selection: options.selection === undefined ? { configId: "lab", appId: "ops", screenId: "arm" } : options.selection,
    setSelection: (selection) => selections.push(selection),
  });
  return { actions, navigations, selections, writes };
}

describe("saving from the Builder", () => {
  it("writes the screen and the app into the configuration and app that are selected", async () => {
    const { actions, writes } = harness();
    await actions.saveScreen({ id: "arm" } as ScreenConfig);
    await actions.saveApplication(app("ops"));
    expect(writes).toEqual(["screen lab/ops/arm", "app lab/ops"]);
  });

  it("refuses to save, upload or create before anything is selected or loaded", async () => {
    const { actions } = harness({ selection: null });
    await expect(actions.saveScreen({ id: "arm" } as ScreenConfig)).rejects.toThrow(
      "Bloom cannot save before a configuration workspace is selected.",
    );
    await expect(actions.uploadThemeAsset(new File(["x"], "logo.svg"))).rejects.toThrow(
      "Bloom cannot upload a theme asset before an application is selected.",
    );
    const loading = createApplicationActions({
      configurationClient: {} as ConfigurationClient,
      configurationState: { status: "loading" } as ConfigurationLoadState,
      navigate: () => undefined,
      selection: null,
      setSelection: () => undefined,
    });
    await expect(loading.createApplication("x", app("x"))).rejects.toThrow(
      "Bloom cannot create an application before configurations are loaded.",
    );
    await expect(loading.deleteApplication("lab", "ops")).rejects.toThrow("delete an application");
  });

  it("uploads a theme asset as base64 under the selected configuration and hands back its URI", async () => {
    const { actions } = harness();
    const file = new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" });
    await expect(actions.uploadThemeAsset(file)).resolves.toBe(
      `bloom-asset://lab/logo.svg#image/svg+xml#${btoa("<svg/>")}`,
    );
  });
});

describe("creating, duplicating and deleting apps", () => {
  it("gives a new app a configuration of its own and opens it in the Builder", async () => {
    const { actions, navigations, selections, writes } = harness({ serverIds: ["lab"] });
    await actions.createApplication("lab", app("mine", ["first"]));
    expect(writes).toEqual(["config lab-2:mine"]);
    expect(selections).toEqual([{ configId: "lab-2", appId: "mine", screenId: "first" }]);
    expect(navigations).toHaveLength(1);
  });

  it("refuses to duplicate an app from a configuration it does not know", async () => {
    const { actions, writes } = harness();
    await expect(actions.duplicateApplication("nowhere", "ops")).rejects.toThrow(
      'Configuration "nowhere" was not found.',
    );
    expect(writes).toEqual([]);
  });

  it("gives up on an id the server keeps claiming, without writing anything", async () => {
    const serverIds = Array.from({ length: 60 }, (_, index) => (index === 0 ? "lab" : `lab-${index + 1}`));
    const { actions, writes } = harness({ serverIds });
    await expect(actions.createApplication("lab", app("mine"))).rejects.toThrow(
      'Bloom could not find a free configuration id for "lab" on the server.',
    );
    expect(writes).toEqual([]);
  });

  it("selects the next app after a delete, or nothing when the configuration is empty, and goes home", async () => {
    const { actions, navigations, selections, writes } = harness();
    await actions.deleteApplication("lab", "ops");
    expect(writes).toEqual(["delete lab/ops"]);
    expect(selections.at(-1)).toEqual({ configId: "lab", appId: "debug", screenId: "main" });
    await actions.deleteApplication("lab", "debug");
    expect(selections.at(-1)).toBeNull();
    expect(navigations).toHaveLength(2);
  });
});
