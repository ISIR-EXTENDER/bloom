/**
 * @vitest-environment jsdom
 */
import type { ApplicationConfig, ConfigurationBundle, ScreenConfig, ShareStatus } from "@bloom/api-client";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import shared from "../../../../../tests/fixtures/configuration-bundle.json";
import type { ConfigurationClient } from "./configuration-client";
import { useConfigurations } from "./use-configurations";

const bundle = shared as unknown as ConfigurationBundle;
const application = bundle.applications[0] as ApplicationConfig;

/** A backend holding configurations by id, sharing status for each, that also records what it was asked. */
function server(options: { shareFails?: boolean } = {}) {
  const store = new Map<string, ConfigurationBundle>([["sandbox", bundle]]);
  const published: string[] = [];
  const client: ConfigurationClient = {
    listConfigurations: async () => [...store.keys()],
    getConfiguration: async (id) => {
      const found = store.get(id);
      if (!found) throw new Error(`no ${id}`);
      return found;
    },
    getShareStatus: async () => {
      if (options.shareFails) throw new Error("no share status");
      return Object.fromEntries(
        [...store.keys()].map((id) => [
          id,
          { state: published.includes(id) ? "published" : "local" } as unknown as ShareStatus,
        ]),
      );
    },
    upsertConfiguration: async (id, saved) => {
      store.set(id, saved);
      return saved;
    },
    upsertApplication: async (id, app) => {
      const current = store.get(id) as ConfigurationBundle;
      const next = { ...current, applications: current.applications.map((item) => (item.id === app.id ? app : item)) };
      store.set(id, next);
      return next;
    },
    upsertScreen: async (id, appId, screen) => {
      const current = store.get(id) as ConfigurationBundle;
      const next = {
        ...current,
        applications: current.applications.map((item) =>
          item.id === appId ? { ...item, screens: item.screens.map((s) => (s.id === screen.id ? screen : s)) } : item,
        ),
      };
      store.set(id, next);
      return next;
    },
    deleteApplication: async (id, appId) => {
      const current = store.get(id) as ConfigurationBundle;
      store.set(id, { ...current, applications: current.applications.filter((item) => item.id !== appId) });
    },
    takeShippedConfiguration: async (id) => {
      const shipped = { ...bundle, metadata: { ...bundle.metadata, source: "shipped" } };
      store.set(id, shipped);
      return shipped;
    },
    publishConfiguration: async (id) => {
      const already = published.includes(id);
      published.push(id);
      return {
        path: `seed/${id}.json`,
        already_published: already,
        warnings: already ? ["nothing changed"] : undefined,
      } as never;
    },
    uploadThemeAsset: async () => ({ uri: "" }) as never,
  };
  return { client, store };
}

afterEach(cleanup);

describe("the configuration store", () => {
  it("loads what the server holds and its share status, and keeps a save, a screen and an app in step", async () => {
    const { client, store } = server();
    const { result } = renderHook(() => useConfigurations(client));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    if (result.current.status !== "ready") throw new Error("not ready");
    await waitFor(() => {
      if (result.current.status === "ready") expect(result.current.shareStatus.sandbox).toEqual({ state: "local" });
    });

    const renamed = { ...application, name: "Renamed" };
    await act(async () => {
      await (
        result.current as { saveApplication: (id: string, app: ApplicationConfig) => Promise<unknown> }
      ).saveApplication("sandbox", renamed);
    });
    const ready = () => (result.current.status === "ready" ? result.current : null);
    expect(ready()?.configurations[0]?.bundle.applications[0]?.name).toBe("Renamed");

    const screen = { ...(application.screens[0] as ScreenConfig), title: "Main renamed" };
    await act(async () => {
      await ready()?.saveScreen("sandbox", application.id, screen);
    });
    expect(ready()?.configurations[0]?.bundle.applications[0]?.screens[0]?.title).toBe("Main renamed");

    await act(async () => {
      await ready()?.saveConfiguration("mine", { ...bundle, applications: [{ ...application, id: "copy" }] });
    });
    expect(ready()?.configurations.map((configuration) => configuration.id)).toEqual(["sandbox", "mine"]);
    expect(store.get("mine")?.applications[0]?.id).toBe("copy");
  });

  it("removes a deleted app from the loaded bundle", async () => {
    const { client } = server();
    const { result } = renderHook(() => useConfigurations(client));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(async () => {
      if (result.current.status === "ready") await result.current.deleteApplication("sandbox", application.id);
    });
    expect(result.current.status === "ready" && result.current.configurations[0]?.bundle.applications).toEqual([]);
  });

  it("takes the shipped copy back and publishes, refreshing the badges each time", async () => {
    const { client } = server();
    const { result } = renderHook(() => useConfigurations(client));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    let taken: unknown;
    await act(async () => {
      if (result.current.status === "ready") taken = await result.current.takeShipped("sandbox");
    });
    expect(taken).toMatchObject({ id: "sandbox", bundle: { metadata: { source: "shipped" } } });

    let first: unknown;
    let second: unknown;
    await act(async () => {
      if (result.current.status === "ready") first = await result.current.publish("sandbox");
    });
    await act(async () => {
      if (result.current.status === "ready") second = await result.current.publish("sandbox");
    });
    expect(first).toEqual({ path: "seed/sandbox.json", alreadyPublished: false, warnings: [] });
    expect(second).toEqual({ path: "seed/sandbox.json", alreadyPublished: true, warnings: ["nothing changed"] });
    expect(result.current.status === "ready" && result.current.shareStatus.sandbox).toEqual({ state: "published" });
  });

  it("leaves the badges off when the server cannot say where a configuration stands", async () => {
    const { client } = server({ shareFails: true });
    const { result } = renderHook(() => useConfigurations(client));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(async () => {
      if (result.current.status === "ready") await result.current.publish("sandbox");
    });
    expect(result.current.status === "ready" && result.current.shareStatus).toEqual({});
  });
});
