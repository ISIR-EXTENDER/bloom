import { describe, expect, it, vi } from "vitest";
import sharedConfigurationBundle from "../../../../tests/fixtures/configuration-bundle.json";
import { type BloomApiError, type ConfigurationBundle, createBloomApiClient } from "./index";

const sampleBundle = sharedConfigurationBundle as unknown as ConfigurationBundle;

describe("Bloom API client", () => {
  it("lists configuration ids", async () => {
    const fetcher = createJsonFetcher({ configuration_ids: ["sandbox", "petanque"] });
    const client = createBloomApiClient({ baseUrl: "http://localhost:8000/", fetcher });

    await expect(client.listConfigurations()).resolves.toEqual(["sandbox", "petanque"]);
    expect(fetcher).toHaveBeenCalledWith("http://localhost:8000/api/v1/configurations", {});
  });

  it("binds the default fetcher to the global object", async () => {
    const originalFetch = globalThis.fetch;
    const fetcher = vi.fn(async function (this: typeof globalThis) {
      if (this !== globalThis) {
        throw new TypeError("Illegal invocation");
      }
      return new Response(JSON.stringify({ configuration_ids: ["sandbox"] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    globalThis.fetch = fetcher as typeof fetch;

    try {
      const client = createBloomApiClient();

      await expect(client.listConfigurations()).resolves.toEqual(["sandbox"]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("gets a configuration bundle with an encoded id", async () => {
    const fetcher = createJsonFetcher(sampleBundle);
    const client = createBloomApiClient({ fetcher });

    await expect(client.getConfiguration("sandbox/demo")).resolves.toEqual(sampleBundle);
    expect(fetcher).toHaveBeenCalledWith("/api/v1/configurations/sandbox%2Fdemo", {});
  });

  it("accepts the shared backend configuration contract fixture", async () => {
    const fetcher = createJsonFetcher(sharedConfigurationBundle);
    const client = createBloomApiClient({ fetcher });

    const configuration = await client.getConfiguration("sandbox");

    expect(configuration.metadata.source).toBe("shared-contract-fixture");
    expect(configuration.applications[0]?.screens[0]?.canvas).toEqual({
      preset_id: "hd",
      runtime_mode: "fit",
    });
    expect(configuration.applications[0]?.screens[0]?.widgets[0]?.layout).toEqual({
      x: 24,
      y: 32,
      width: 220,
      height: 96,
    });
    expect(configuration.applications[0]?.screens[0]?.widgets[0]?.settings).toEqual({
      topic: "/ui/ros_toggle",
      payloadOn: { data: [13, 1] },
      payloadOff: { data: [13, 0] },
    });
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

  it("lists applications from one configuration", async () => {
    const applications = sampleBundle.applications;
    const fetcher = createJsonFetcher({ applications });
    const client = createBloomApiClient({ fetcher });

    await expect(client.listApplications("sandbox")).resolves.toEqual(applications);
    expect(fetcher).toHaveBeenCalledWith("/api/v1/configurations/sandbox/applications", {});
  });

  it("upserts an application through the backend", async () => {
    const application = sampleBundle.applications[0];
    const fetcher = createJsonFetcher(sampleBundle);
    const client = createBloomApiClient({ fetcher });

    if (!application) {
      throw new Error("Sample application is missing.");
    }

    await expect(client.upsertApplication("sandbox", application)).resolves.toEqual(sampleBundle);
    expect(fetcher).toHaveBeenCalledWith("/api/v1/configurations/sandbox/applications/sandbox", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(application),
    });
  });

  it("lists reusable screens with their source app", async () => {
    const screen = sampleBundle.applications[0]?.screens[0];
    const response = {
      screens: [
        {
          screen,
          source_application_id: "sandbox",
          source_application_name: "Sandbox",
        },
      ],
    };
    const fetcher = createJsonFetcher(response);
    const client = createBloomApiClient({ fetcher });

    await expect(client.listReusableScreens("sandbox")).resolves.toEqual(response.screens);
    expect(fetcher).toHaveBeenCalledWith("/api/v1/configurations/sandbox/screens", {});
  });

  it("upserts a screen through the backend", async () => {
    const screen = sampleBundle.applications[0]?.screens[0];
    const fetcher = createJsonFetcher(sampleBundle);
    const client = createBloomApiClient({ fetcher });

    if (!screen) {
      throw new Error("Sample screen is missing.");
    }

    await expect(client.upsertScreen("sandbox", "operator", screen)).resolves.toEqual(sampleBundle);
    expect(fetcher).toHaveBeenCalledWith("/api/v1/configurations/sandbox/applications/operator/screens/main", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(screen),
    });
  });

  it("deletes a configuration bundle", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    const client = createBloomApiClient({ fetcher });

    await expect(client.deleteConfiguration("sandbox")).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledWith("/api/v1/configurations/sandbox", { method: "DELETE" });
  });

  it("publishes a ROS topic message through the backend", async () => {
    const responsePayload = {
      topic: "/petanque_state_machine/change_state",
      message_type: "std_msgs/msg/String",
      status: "published",
      detail: "ROS message published.",
    };
    const requestPayload = {
      topic: "/petanque_state_machine/change_state",
      message_type: "std_msgs/msg/String",
      payload: { data: "activate_throw" },
    };
    const fetcher = createJsonFetcher(responsePayload);
    const client = createBloomApiClient({ fetcher });

    await expect(client.publishRosTopic(requestPayload)).resolves.toEqual(responsePayload);
    expect(fetcher).toHaveBeenCalledWith("/api/v1/ros/topics/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestPayload),
    });
  });

  it("publishes CLI-style ROS payload text through the backend", async () => {
    const responsePayload = {
      topic: "/ui/ros_toggle",
      message_type: "std_msgs/msg/Int32MultiArray",
      status: "simulated",
      detail: "ROS publisher gateway is not configured.",
    };
    const requestPayload = {
      topic: "/ui/ros_toggle",
      message_type: "std_msgs/msg/Int32MultiArray",
      payload_text: "{data: [13, 1]}",
    };
    const fetcher = createJsonFetcher(responsePayload);
    const client = createBloomApiClient({ fetcher });

    await expect(client.publishRosTopic(requestPayload)).resolves.toEqual(responsePayload);
    expect(fetcher).toHaveBeenCalledWith("/api/v1/ros/topics/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestPayload),
    });
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
