import { describe, expect, it, vi } from "vitest";
import { loadConfigurations } from "./configuration-loader";

const bundle = { metadata: { exported_at: "", schema_version: 1, source: "test" }, applications: [] };

describe("loading the configurations", () => {
  // A 409 on one bundle made Promise.all fail the Builder and the runtime for every app.
  it("skips one that cannot be read and loads the rest", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const client = {
      listConfigurations: vi.fn(async () => ["good", "broken"]),
      getConfiguration: vi.fn(async (id: string) => {
        if (id === "broken") throw new Error("409 unreadable");
        return bundle;
      }),
    } as unknown as Parameters<typeof loadConfigurations>[0];

    const loaded = await loadConfigurations(client);

    expect(loaded.map((configuration) => configuration.id)).toEqual(["good"]);
  });

  it("still fails when nothing can be read, so the page says so and retries", async () => {
    const client = {
      listConfigurations: vi.fn(async () => ["broken"]),
      getConfiguration: vi.fn(async () => {
        throw new Error("offline");
      }),
    } as unknown as Parameters<typeof loadConfigurations>[0];

    await expect(loadConfigurations(client)).rejects.toThrow("offline");
  });
});
