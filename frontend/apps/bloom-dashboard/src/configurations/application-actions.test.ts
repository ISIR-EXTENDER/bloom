import { type ApplicationConfig, BloomApiError, type ConfigurationBundle } from "@bloom/api-client";
import { describe, expect, it, vi } from "vitest";

import { createApplicationActions } from "./application-actions";
import type { ConfigurationClient } from "./configuration-client";
import type { ConfigurationLoadState } from "./use-configurations";

const app = (id: string, name: string) => ({ id, name, screens: [{ id: "main" }] }) as unknown as ApplicationConfig;
const bundle = (...applications: ApplicationConfig[]) =>
  ({ metadata: {}, applications }) as unknown as ConfigurationBundle;

describe("duplicating an app", () => {
  // The copy was written into the source configuration, often a shipped file.
  it("writes the copy to a new configuration under an id and a name nobody has", async () => {
    const saveApplication = vi.fn();
    const saveConfiguration = vi.fn();
    const setSelection = vi.fn();
    const state = {
      status: "ready",
      configurations: [
        { id: "explorer", bundle: bundle(app("explorer", "Explorer")) },
        { id: "mine", bundle: bundle(app("explorer-copy", "Explorer Copy")) },
      ],
      saveApplication,
      saveConfiguration,
      shareStatus: { "explorer-copy-2": {} },
    } as unknown as ConfigurationLoadState;
    const actions = createApplicationActions({
      configurationClient: serverWith([]),
      configurationState: state,
      navigate: vi.fn(),
      selection: null,
      setSelection,
    });

    await actions.duplicateApplication("explorer", "explorer");

    expect(saveApplication).not.toHaveBeenCalled();
    expect(saveConfiguration).toHaveBeenCalledTimes(1);
    const [configId, saved] = saveConfiguration.mock.calls[0] as [string, ConfigurationBundle];
    expect(configId).toBe("explorer-copy-2-2");
    expect(saved.applications).toHaveLength(1);
    expect(saved.applications[0]).toMatchObject({ id: "explorer-copy-2", name: "Explorer Copy 2" });
    expect(setSelection).toHaveBeenCalledWith({ configId, appId: "explorer-copy-2", screenId: "main" });
  });
});

/** A server holding these configuration ids; any other answers 404. */
function serverWith(ids: readonly string[]) {
  return {
    getConfiguration: vi.fn(async (id: string) => {
      if (!ids.includes(id)) throw new BloomApiError("Not found", 404, "");
      return bundle();
    }),
  } as unknown as ConfigurationClient;
}

describe("a new app's configuration id", () => {
  // Unique only among what this client had loaded, so a second client's new app overwrote the first's file.
  it("skips an id the server already holds", async () => {
    const saveConfiguration = vi.fn();
    const state = {
      status: "ready",
      configurations: [{ id: "explorer", bundle: bundle(app("explorer", "Explorer")) }],
      saveApplication: vi.fn(),
      saveConfiguration,
      shareStatus: {},
    } as unknown as ConfigurationLoadState;
    const setSelection = vi.fn();
    const actions = createApplicationActions({
      configurationClient: serverWith(["my-app", "my-app-2", "explorer-copy"]),
      configurationState: state,
      navigate: vi.fn(),
      selection: null,
      setSelection,
    });

    await actions.createApplication("my-app", app("my-app", "My app"));
    await actions.duplicateApplication("explorer", "explorer");

    expect(saveConfiguration.mock.calls.map(([configId]) => configId)).toEqual(["my-app-3", "explorer-copy-2"]);
    expect(setSelection).toHaveBeenCalledWith({ configId: "my-app-3", appId: "my-app", screenId: "main" });
  });

  it("does not write when the server cannot say whether the id is free", async () => {
    const saveConfiguration = vi.fn();
    const actions = createApplicationActions({
      configurationClient: {
        getConfiguration: vi.fn(async () => {
          throw new BloomApiError("Server error", 500, "");
        }),
      } as unknown as ConfigurationClient,
      configurationState: {
        status: "ready",
        configurations: [],
        saveConfiguration,
        shareStatus: {},
      } as unknown as ConfigurationLoadState,
      navigate: vi.fn(),
      selection: null,
      setSelection: vi.fn(),
    });

    await expect(actions.createApplication("my-app", app("my-app", "My app"))).rejects.toThrow("Server error");
    expect(saveConfiguration).not.toHaveBeenCalled();
  });
});
