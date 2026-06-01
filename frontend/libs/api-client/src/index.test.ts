import { describe, expect, it, vi } from "vitest";

import { BloomApiError, createBloomApiClient, type ConfigurationBundle } from "./index";

const sampleBundle: ConfigurationBundle = {
  metadata: {
    schema_version: 1,
    exported_at: "2026-06-01T14:00:00Z",
    source: "api-client-test",
  },
  applications: [
    {
      id: "sandbox",
      name: "Sandbox",
      description: "Sandbox operator interface",
      screens: [
        {
          id: "main",
          title: "Main",
          widgets: [
            {
              id: "gripper",
              kind: "toggle",
              title: "Gripper",
              settings: { topic: "/gripper_controller/commands" },
            },
          ],
        },
      ],
    },
  ],
};

describe("Bloom API client", () => {
  it("lists configuration ids", async () => {
    const fetcher = createJsonFetcher({ configuration_ids: ["sandbox", "petanque"] });
    const client = createBloomApiClient({ baseUrl: "http://localhost:8000/", fetcher });

    await expect(client.listConfigurations()).resolves.toEqual(["sandbox", "petanque"]);
    expect(fetcher).toHaveBeenCalledWith("http://localhost:8000/api/v1/configurations", {});
  });

  it("gets a configuration bundle with an encoded id", async () => {
    const fetcher = createJsonFetcher(sampleBundle);
    const client = createBloomApiClient({ fetcher });

    await expect(client.getConfiguration("sandbox/demo")).resolves.toEqual(sampleBundle);
    expect(fetcher).toHaveBeenCalledWith("/api/v1/configurations/sandbox%2Fdemo", {});
  });

  it("upserts a configuration bundle", async () => {
    const fetcher = createJsonFetcher(sampleBundle);
    const client = createBloomApiClient({ fetcher });

    await expect(client.upsertConfiguration("sandbox", sampleBundle)).resolves.toEqual(sampleBundle);
    expect(fetcher).toHaveBeenCalledWith("/api/v1/configurations/sandbox", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sampleBundle),
    });
  });

  it("deletes a configuration bundle", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    const client = createBloomApiClient({ fetcher });

    await expect(client.deleteConfiguration("sandbox")).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledWith("/api/v1/configurations/sandbox", { method: "DELETE" });
  });

  it("throws a typed error when the backend rejects a request", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ detail: "configuration not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const client = createBloomApiClient({ fetcher });

    await expect(client.getConfiguration("missing")).rejects.toMatchObject({
      name: "BloomApiError",
      status: 404,
      responseText: '{"detail":"configuration not found"}',
    } satisfies Partial<BloomApiError>);
  });
});

function createJsonFetcher(payload: unknown): typeof fetch {
  return vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}
