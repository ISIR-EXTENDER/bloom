import { describe, expect, it } from "vitest";
import { BloomApiError, createBloomApiClient } from "./client";
import type { ApplicationConfig, ScreenConfig } from "./types";

type Received = { method: string; url: string; body: unknown; headers: Headers };

/**
 * A backend that answers by route and keeps what it was sent: the wire format is the contract the tests read,
 * on both sides of the call.
 */
function fakeApi(routes: Record<string, (received: Received) => Response | Promise<Response>>) {
  const received: Received[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const entry: Received = {
      method,
      url,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      headers: new Headers(init?.headers),
    };
    received.push(entry);
    const route = routes[`${method} ${url.replace(/\?.*$/, "")}`];
    if (!route) {
      return new Response(JSON.stringify({ detail: `no route for ${method} ${url}` }), { status: 404 });
    }
    return route(entry);
  };
  return { client: createBloomApiClient({ baseUrl: "http://api", fetcher }), received };
}

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" }, ...init });
const noContent = () => new Response(null, { status: 204 });

describe("configuration management calls", () => {
  it("deletes an application and a screen by their encoded ids, expecting nothing back", async () => {
    const { client, received } = fakeApi({
      "DELETE http://api/api/v1/configurations/lab/applications/a%2Fb": noContent,
      "DELETE http://api/api/v1/configurations/lab/applications/a%2Fb/screens/s%201": noContent,
    });
    await expect(client.deleteApplication("lab", "a/b")).resolves.toBeUndefined();
    await expect(client.deleteScreen("lab", "a/b", "s 1")).resolves.toBeUndefined();
    expect(received.map((entry) => entry.method)).toEqual(["DELETE", "DELETE"]);
  });

  it("reads the share status of every configuration, takes the shipped copy back, and publishes", async () => {
    const { client, received } = fakeApi({
      "GET http://api/api/v1/configurations/share-status": () =>
        json({ statuses: { sandbox: { state: "shipped-modified" } } }),
      "POST http://api/api/v1/configurations/sandbox/take-shipped": () => json({ metadata: { source: "shipped" } }),
      "POST http://api/api/v1/configurations/sandbox/publish": () =>
        json({ published: true, path: "seed/sandbox.json" }),
    });
    await expect(client.getShareStatus()).resolves.toEqual({ sandbox: { state: "shipped-modified" } });
    await expect(client.takeShippedConfiguration("sandbox")).resolves.toEqual({ metadata: { source: "shipped" } });
    await expect(client.publishConfiguration("sandbox")).resolves.toEqual({
      published: true,
      path: "seed/sandbox.json",
    });
    expect(received.slice(1).every((entry) => entry.method === "POST" && entry.body === undefined)).toBe(true);
  });

  it("uploads a theme asset as JSON and returns where the backend put it", async () => {
    const upload = { kind: "logo", file_name: "logo.svg", content_type: "image/svg+xml", data_base64: "PHN2Zy8+" };
    const { client, received } = fakeApi({
      "POST http://api/api/v1/configurations/lab/theme-assets": ({ body }) =>
        json({ url: `/theme-assets/lab/${(body as { file_name: string }).file_name}` }),
    });
    await expect(client.uploadThemeAsset("lab", upload as never)).resolves.toEqual({
      url: "/theme-assets/lab/logo.svg",
    });
    expect(received[0]?.headers.get("content-type")).toBe("application/json");
    expect(received[0]?.body).toEqual(upload);
  });

  it("carries an application's own id in the path it is written to", async () => {
    const application = { id: "ops/main", name: "Ops", screens: [] } as unknown as ApplicationConfig;
    const screen = { id: "home", title: "Home", widgets: [] } as unknown as ScreenConfig;
    const { client, received } = fakeApi({
      "PUT http://api/api/v1/configurations/lab/applications/ops%2Fmain": ({ body }) => json({ applications: [body] }),
      "PUT http://api/api/v1/configurations/lab/applications/ops%2Fmain/screens/home": ({ body }) =>
        json({ screens: [body] }),
    });
    await expect(client.upsertApplication("lab", application)).resolves.toEqual({ applications: [application] });
    await expect(client.upsertScreen("lab", "ops/main", screen)).resolves.toEqual({ screens: [screen] });
    expect(received.map((entry) => entry.method)).toEqual(["PUT", "PUT"]);
  });
});

describe("robot model calls", () => {
  it("throws a typed error with the body when the description is refused, and caches only a tagged one", async () => {
    let status = 503;
    const { client, received } = fakeApi({
      "GET http://api/api/v1/ros/robot-model": () =>
        status === 200
          ? json({ urdf: "<robot/>", packages: [] })
          : new Response(JSON.stringify({ detail: "no robot" }), { status }),
    });
    const refused = client.readRobotModel();
    await expect(refused).rejects.toBeInstanceOf(BloomApiError);
    await expect(refused).rejects.toMatchObject({ status: 503, responseText: '{"detail":"no robot"}' });

    status = 200;
    await expect(client.readRobotModel()).resolves.toEqual({ urdf: "<robot/>", packages: [] });
    // No ETag came back, so the next read carries no tag and asks for the whole thing again.
    await client.readRobotModel();
    expect(received.at(-1)?.headers.has("if-none-match")).toBe(false);
  });

  it("fetches a mesh by package and path, encoding each segment, and gives null when the API has none", async () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    const { client, received } = fakeApi({
      "GET http://api/api/v1/ros/robot-model/assets/arm%20desc/meshes/base%20link.stl": () =>
        new Response(bytes, { status: 200 }),
    });
    const mesh = await client.readRobotModelAsset("arm desc", "meshes/base link.stl");
    expect(new Uint8Array(mesh as ArrayBuffer)).toEqual(new Uint8Array([1, 2, 3]));
    expect(received[0]?.url).toBe("http://api/api/v1/ros/robot-model/assets/arm%20desc/meshes/base%20link.stl");
    await expect(client.readRobotModelAsset("arm desc", "meshes/missing.stl")).resolves.toBeNull();
  });
});

describe("runtime calls", () => {
  it("reads capabilities, the STOP state and the control state as the backend reports them", async () => {
    const { client } = fakeApi({
      "GET http://api/api/v1/capabilities": () => json({ ros: { available: false }, camera: { available: true } }),
      "GET http://api/api/v1/runtime/stop": () => json({ engaged: true, engaged_at: "t1" }),
      "GET http://api/api/v1/runtime/control": () => json({ owner: "tablet-1" }),
    });
    await expect(client.listRuntimeCapabilities()).resolves.toEqual({
      ros: { available: false },
      camera: { available: true },
    });
    await expect(client.getRuntimeStopState()).resolves.toEqual({ engaged: true, engaged_at: "t1" });
    await expect(client.getRuntimeControlState()).resolves.toEqual({ owner: "tablet-1" });
  });

  it("reads parameters for one node by name, as a comma list the backend splits", async () => {
    const { client, received } = fakeApi({
      "GET http://api/api/v1/ros/parameters": () =>
        json({ parameters: [{ node: "/cartesian_manager", name: "shapers.snake.gain", value: 3 }] }),
    });
    await expect(client.getRosParameters("/cartesian_manager", ["shapers.snake.gain", "mode"])).resolves.toEqual([
      { node: "/cartesian_manager", name: "shapers.snake.gain", value: 3 },
    ]);
    expect(received[0]?.url).toBe(
      "http://api/api/v1/ros/parameters?node=%2Fcartesian_manager&names=shapers.snake.gain%2Cmode",
    );
  });
});

describe("saved positions", () => {
  const home = { name: "home", joint_names: ["j1"], positions: [0.1], description: "" };

  it("scopes every call to one application, and sends none when no scope is given", async () => {
    const { client, received } = fakeApi({
      "GET http://api/api/v1/runtime/positions": () => json({ positions: [home] }),
      "POST http://api/api/v1/runtime/positions": ({ body }) => json(body),
      "DELETE http://api/api/v1/runtime/positions/home": () => json({ positions: [] }),
      "GET http://api/api/v1/runtime/positions/export": () =>
        json({ yaml: "joint_targets: {}", target_names: ["home"] }),
    });
    const scope = { appId: "explorer", configId: "lab" };
    await expect(client.listSavedPositions(scope)).resolves.toEqual([home]);
    await expect(client.saveSavedPosition(home, scope)).resolves.toEqual(home);
    await expect(client.deleteSavedPosition("home", scope)).resolves.toEqual([]);
    await expect(client.exportSavedPositions(scope)).resolves.toEqual({
      yaml: "joint_targets: {}",
      target_names: ["home"],
    });
    expect(received.map((entry) => entry.url.split("?")[1])).toEqual(Array(4).fill("app_id=explorer&config_id=lab"));
    expect(received[1]?.body).toEqual(home);

    await client.listSavedPositions();
    expect(received.at(-1)?.url).toBe("http://api/api/v1/runtime/positions");
  });

  it("encodes a pose name with a slash rather than losing it in the path", async () => {
    const { client, received } = fakeApi({
      "DELETE http://api/api/v1/runtime/positions/left%2Fhigh": () => json({ positions: [] }),
    });
    await expect(client.deleteSavedPosition("left/high")).resolves.toEqual([]);
    expect(received[0]?.url).toBe("http://api/api/v1/runtime/positions/left%2Fhigh");
  });
});
