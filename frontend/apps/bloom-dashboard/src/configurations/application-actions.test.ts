import type { ApplicationConfig, ConfigurationBundle } from "@bloom/api-client";
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
      configurationClient: {} as ConfigurationClient,
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
