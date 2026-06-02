import type { ConfigurationBundle } from "@bloom/api-client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import migratedPetanqueAdminConfiguration from "../../../../tests/fixtures/petanque-admin-configuration-bundle.json";
import { App } from "./App";
import type { ConfigurationClient } from "./configurations/configuration-client";
import type { RuntimeActionClient } from "./runtime/runtime-action-dispatcher";

describe("App", () => {
  it("renders the separated landing page", () => {
    render(<App configurationClient={createConfigurationClient()} />);

    expect(screen.getByRole("heading", { level: 1, name: /robot interfaces that grow cleanly/i })).toBeVisible();
    expect(screen.getByText(/configurable robot teleoperation/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /open builder preview/i })).toBeVisible();
    expect(screen.queryByRole("heading", { level: 2, name: "Choose what to preview" })).not.toBeInTheDocument();
  });

  it("renders the first workflow cards on the landing page", () => {
    render(<App configurationClient={createConfigurationClient()} />);

    expect(screen.getByRole("heading", { level: 2, name: "Configure" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Control" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Observe" })).toBeVisible();
  });

  it("opens the builder preview with loaded configurations", async () => {
    render(<App configurationClient={createConfigurationClient()} />);

    fireEvent.click(screen.getByRole("button", { name: /open builder preview/i }));

    expect(await screen.findByRole("region", { name: "Bloom builder workspace" })).toBeVisible();
    expect(await screen.findByRole("heading", { level: 2, name: "Choose what to preview" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Main" })).toBeVisible();
    expect(screen.getByText(/Sandbox operator interface/i)).toBeInTheDocument();
    expect(screen.getAllByText("Digital output").length).toBeGreaterThan(0);
    expect(screen.getByText("/ui/ros_toggle")).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Digital output" })).toBeVisible();
  });

  it("switches screens inside the builder workspace", async () => {
    render(<App configurationClient={createConfigurationClient()} />);

    fireEvent.click(screen.getByRole("button", { name: "Builder: Compose screens" }));
    fireEvent.click(await screen.findByRole("button", { name: /Diagnostics/i }));

    expect(screen.getByRole("heading", { level: 2, name: "Diagnostics" })).toBeVisible();
    expect(screen.getByText("/teleop_cmd")).toBeVisible();
    expect(screen.getByText("Waiting for messages...")).toBeVisible();
  });

  it("shows a coming soon message for registered screens without migrated widgets", async () => {
    render(<App configurationClient={createConfigurationClient()} />);

    fireEvent.click(screen.getByRole("button", { name: "Builder: Compose screens" }));
    fireEvent.click(await screen.findByRole("button", { name: /Placeholder/i }));

    expect(screen.getByRole("heading", { level: 2, name: "Placeholder" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Screen implementation coming soon" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Coming soon" })).toBeVisible();
  });

  it("moves widgets on the builder canvas draft", async () => {
    render(<App configurationClient={createConfigurationClient()} />);

    fireEvent.click(screen.getByRole("button", { name: "Builder: Compose screens" }));

    const moveHandle = await screen.findByRole("button", { name: "Select and move Digital output widget" });
    fireEvent.pointerDown(moveHandle, { button: 0, clientX: 10, clientY: 10 });
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 50, clientY: 26 }));
    window.dispatchEvent(new MouseEvent("pointerup"));

    await waitFor(() => {
      expect(screen.getByText((_, element) => element?.textContent === "64, 48")).toBeVisible();
    });

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));

    await waitFor(() => {
      expect(screen.getByText((_, element) => element?.textContent === "24, 32")).toBeVisible();
    });

    fireEvent.click(screen.getByRole("button", { name: "Redo" }));

    await waitFor(() => {
      expect(screen.getByText((_, element) => element?.textContent === "64, 48")).toBeVisible();
    });
  });

  it("saves builder drafts through the configuration API", async () => {
    const configurationClient = createConfigurationClient();

    render(<App configurationClient={configurationClient} />);

    fireEvent.click(screen.getByRole("button", { name: "Builder: Compose screens" }));
    await moveDigitalOutputWidget();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(configurationClient.upsertConfiguration).toHaveBeenCalledTimes(1);
    });

    const [configId, savedBundle] = configurationClient.upsertConfiguration.mock.calls[0] ?? [];
    const savedWidget = savedBundle?.applications[0]?.screens[0]?.widgets[0];

    expect(configId).toBe("sandbox");
    expect(savedWidget?.layout).toEqual({ x: 64, y: 48, width: 220, height: 96 });
    expect(await screen.findByRole("status")).toHaveTextContent("All changes saved.");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("discards builder drafts before saving", async () => {
    const configurationClient = createConfigurationClient();

    render(<App configurationClient={configurationClient} />);

    fireEvent.click(screen.getByRole("button", { name: "Builder: Compose screens" }));
    await moveDigitalOutputWidget();

    await waitFor(() => {
      expect(screen.getByText((_, element) => element?.textContent === "64, 48")).toBeVisible();
    });

    fireEvent.click(screen.getByRole("button", { name: "Discard" }));

    await waitFor(() => {
      expect(screen.getByText((_, element) => element?.textContent === "24, 32")).toBeVisible();
    });

    expect(configurationClient.upsertConfiguration).not.toHaveBeenCalled();
  });

  it("adds widgets from the builder palette", async () => {
    render(<App configurationClient={createConfigurationClient()} />);

    fireEvent.click(screen.getByRole("button", { name: "Builder: Compose screens" }));
    fireEvent.click(await screen.findByRole("button", { name: "Add Label widget" }));

    expect(screen.getByRole("heading", { level: 2, name: "Label" })).toBeVisible();
    expect(screen.getByText((_, element) => element?.textContent === "56, 56")).toBeVisible();
    expect(screen.getByText((_, element) => element?.textContent === "280 x 64")).toBeVisible();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });

  it("duplicates the selected builder widget", async () => {
    render(<App configurationClient={createConfigurationClient()} />);

    fireEvent.click(screen.getByRole("button", { name: "Builder: Compose screens" }));
    fireEvent.click(await screen.findByRole("button", { name: "Duplicate widget" }));

    expect(screen.getByRole("heading", { level: 2, name: "Digital output copy" })).toBeVisible();
    expect(screen.getByText((_, element) => element?.textContent === "48, 56")).toBeVisible();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });

  it("removes the selected builder widget", async () => {
    render(<App configurationClient={createConfigurationClient()} />);

    fireEvent.click(screen.getByRole("button", { name: "Builder: Compose screens" }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove widget" }));

    expect(screen.getByRole("region", { name: "Screen implementation coming soon" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Add Label widget" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });

  it("edits selected widget settings from the inspector", async () => {
    const configurationClient = createConfigurationClient();

    render(<App configurationClient={configurationClient} />);

    fireEvent.click(screen.getByRole("button", { name: "Builder: Compose screens" }));
    fireEvent.change(await screen.findByLabelText("Output topic"), { target: { value: "/ui/custom_output" } });
    fireEvent.change(screen.getByLabelText("ON payload"), { target: { value: "{data: [42, 1]}" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(configurationClient.upsertConfiguration).toHaveBeenCalledTimes(1);
    });

    const savedWidget =
      configurationClient.upsertConfiguration.mock.calls[0]?.[1].applications[0]?.screens[0]?.widgets[0];

    expect(savedWidget?.settings).toMatchObject({
      onPayload: "{data: [42, 1]}",
      topic: "/ui/custom_output",
    });
  });

  it("updates label widget previews from inspector settings", async () => {
    render(<App configurationClient={createConfigurationClient()} />);

    fireEvent.click(screen.getByRole("button", { name: "Builder: Compose screens" }));
    fireEvent.click(await screen.findByRole("button", { name: "Add Label widget" }));
    fireEvent.change(screen.getByLabelText("Text"), { target: { value: "Bloom title" } });

    expect(screen.getByText("Bloom title")).toBeVisible();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });

  it("shows field validation errors for invalid inspector settings", async () => {
    render(<App configurationClient={createConfigurationClient()} />);

    fireEvent.click(screen.getByRole("button", { name: "Builder: Compose screens" }));
    fireEvent.click(await screen.findByRole("button", { name: "Add Slider widget" }));
    fireEvent.change(screen.getByLabelText("Maximum"), { target: { value: "-2" } });

    expect(await screen.findByRole("alert")).toHaveTextContent("max must be greater than min");
  });

  it("keeps builder drafts dirty when saving fails", async () => {
    const configurationClient = createConfigurationClient({ saveError: new Error("SQLite write failed") });

    render(<App configurationClient={configurationClient} />);

    fireEvent.click(screen.getByRole("button", { name: "Builder: Compose screens" }));
    await moveDigitalOutputWidget();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("SQLite write failed");
    expect(screen.getByText((_, element) => element?.textContent === "64, 48")).toBeVisible();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });

  it("saves builder drafts from a real migrated legacy configuration", async () => {
    const configurationClient = createConfigurationClient({
      bundles: {
        "petanque-admin": migratedPetanqueAdminConfiguration as ConfigurationBundle,
      },
      ids: ["petanque-admin"],
    });

    render(<App configurationClient={configurationClient} />);

    fireEvent.click(screen.getByRole("button", { name: "Builder: Compose screens" }));
    await moveWidget("RZ");
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(configurationClient.upsertConfiguration).toHaveBeenCalledTimes(1);
    });

    const savedBundle = configurationClient.upsertConfiguration.mock.calls[0]?.[1];
    const savedWidget = savedBundle?.applications[0]?.screens[0]?.widgets.find((widget) => widget.id === "control-rz");

    expect(savedWidget?.layout.width).toBe(338);
    expect(savedWidget?.layout.height).toBe(78);
    expect(savedWidget?.layout.x).toBeGreaterThan(670);
    expect(savedWidget?.layout.y).toBeGreaterThan(9);
  });

  it("resizes widgets on the builder canvas draft", async () => {
    render(<App configurationClient={createConfigurationClient()} />);

    fireEvent.click(screen.getByRole("button", { name: "Builder: Compose screens" }));

    const resizeHandle = await screen.findByRole("button", { name: "Resize Digital output widget" });
    fireEvent.pointerDown(resizeHandle, { button: 0, clientX: 10, clientY: 10 });
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 50, clientY: 50 }));
    window.dispatchEvent(new MouseEvent("pointerup"));

    await waitFor(() => {
      expect(screen.getByText((_, element) => element?.textContent === "264 x 136")).toBeVisible();
    });
  });

  it("dispatches runtime action intents from the full app view", async () => {
    const runtimeActionClient = createRuntimeActionClient();

    render(<App configurationClient={createConfigurationClient()} runtimeActionClient={runtimeActionClient} />);

    fireEvent.click(screen.getByRole("button", { name: "Runtime: Operate and inspect" }));
    fireEvent.click(await screen.findByRole("button", { name: "OFF" }));

    expect(screen.getByRole("region", { name: "Runtime application" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Sandbox" })).toBeVisible();
    expect(screen.queryByRole("heading", { level: 2, name: "Choose what to preview" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2, name: "Action intents" })).not.toBeInTheDocument();
    expect(runtimeActionClient.publishRosTopic).toHaveBeenCalledWith({
      topic: "/ui/ros_toggle",
      message_type: "std_msgs/msg/Int32MultiArray",
      payload_text: "{data: [13, 1]}",
    });
  });

  it("fits the runtime canvas into the available application viewport", async () => {
    render(<App configurationClient={createConfigurationClient()} />);

    fireEvent.click(screen.getByRole("button", { name: "Runtime: Operate and inspect" }));

    const artboard = await screen.findByTestId("runtime-artboard");
    const artboardFrame = artboard.parentElement;
    const frameWidth = Number.parseInt(artboardFrame?.style.width ?? "0", 10);
    const frameHeight = Number.parseInt(artboardFrame?.style.height ?? "0", 10);

    expect(artboard).toHaveStyle({ height: "720px", width: "1280px" });
    expect(artboard.style.transform).toMatch(/^scale\(0\.\d+\)$/);
    expect(frameWidth).toBeGreaterThan(1);
    expect(frameWidth).toBeLessThan(1280);
    expect(frameHeight).toBeGreaterThan(1);
    expect(frameHeight).toBeLessThan(720);
  });

  it("shows a safe coming soon state for empty runtime screens", async () => {
    render(<App configurationClient={createConfigurationClient()} />);

    fireEvent.click(screen.getByRole("button", { name: "Runtime: Operate and inspect" }));
    fireEvent.click(await screen.findByRole("button", { name: /Placeholder/i }));

    expect(screen.getByRole("region", { name: "Runtime screen coming soon" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 3, name: "Placeholder" })).toBeVisible();
    expect(screen.queryByRole("heading", { level: 2, name: "Choose what to preview" })).not.toBeInTheDocument();
  });

  it("renders the first migrated legacy petanque screen end-to-end", async () => {
    render(
      <App
        configurationClient={createConfigurationClient({
          bundles: {
            "petanque-admin": migratedPetanqueAdminConfiguration as ConfigurationBundle,
          },
          ids: ["petanque-admin"],
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Builder: Compose screens" }));

    expect(await screen.findAllByText("app-petanque-admin")).toHaveLength(2);
    expect(screen.getByRole("heading", { level: 2, name: "default_control" })).toBeVisible();
    expect(screen.getAllByText("RZ").length).toBeGreaterThan(0);
    expect(screen.getByText("Z")).toBeVisible();
    expect(screen.getByText("Max Velocity")).toBeVisible();
    expect(screen.getByText("Translation")).toBeVisible();
    expect(screen.getByText("Gripper Control")).toBeVisible();
    expect(screen.getAllByText(/Slider/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /default_live_teleop/i }));

    expect(screen.getByRole("heading", { level: 2, name: "default_live_teleop" })).toBeVisible();
    expect(screen.getByText("Camera Stream")).toBeVisible();
    expect(screen.getAllByText("Camera").length).toBeGreaterThan(0);
  });

  it("renders an empty configuration state inside the main app", async () => {
    render(<App configurationClient={createConfigurationClient({ ids: [] })} />);

    fireEvent.click(screen.getByRole("button", { name: "Builder: Compose screens" }));

    expect(await screen.findByText("No configurations found yet.")).toBeVisible();
  });

  it("renders configuration loading failures inside the main app", async () => {
    render(<App configurationClient={createConfigurationClient({ error: new Error("API unavailable") })} />);

    fireEvent.click(screen.getByRole("button", { name: "Builder: Compose screens" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("API unavailable");
  });
});

function createConfigurationClient(
  options: { bundles?: Record<string, ConfigurationBundle>; ids?: string[]; error?: Error; saveError?: Error } = {},
) {
  const ids = options.ids ?? ["sandbox"];
  const storedBundles = new Map(
    ids.map((id) => [id, structuredClone(options.bundles?.[id] ?? createConfigurationBundle(id))] as const),
  );

  return {
    listConfigurations: vi.fn(async () => {
      if (options.error) {
        throw options.error;
      }
      return ids;
    }),
    getConfiguration: vi.fn(async (id: string): Promise<ConfigurationBundle> => {
      return structuredClone(storedBundles.get(id) ?? createConfigurationBundle(id));
    }),
    upsertConfiguration: vi.fn(async (id: string, bundle: ConfigurationBundle): Promise<ConfigurationBundle> => {
      if (options.saveError) {
        throw options.saveError;
      }

      const savedBundle = structuredClone(bundle);
      storedBundles.set(id, savedBundle);
      return structuredClone(savedBundle);
    }),
  } satisfies ConfigurationClient;
}

function createRuntimeActionClient(): RuntimeActionClient {
  return {
    publishRosTopic: vi.fn(
      async (request) =>
        ({
          topic: request.topic,
          message_type: request.message_type,
          status: "simulated",
          detail: "ROS publisher gateway is not configured.",
        }) as const,
    ),
  };
}

function createConfigurationBundle(id: string): ConfigurationBundle {
  return {
    metadata: {
      schema_version: 1,
      exported_at: "2026-06-01T14:00:00Z",
      source: "dashboard-test",
    },
    applications: [
      {
        id,
        name: "Sandbox",
        description: "Sandbox operator interface",
        screens: [
          {
            id: "main",
            title: "Main",
            canvas: {
              preset_id: "hd",
              runtime_mode: "fit",
            },
            widgets: [
              {
                id: "ros-toggle",
                kind: "toggle",
                title: "Digital output",
                layout: {
                  x: 24,
                  y: 32,
                  width: 220,
                  height: 96,
                },
                settings: {
                  initialValue: false,
                  messageType: "std_msgs/msg/Int32MultiArray",
                  offPayload: "{data: [13, 0]}",
                  onPayload: "{data: [13, 1]}",
                  topic: "/ui/ros_toggle",
                },
              },
            ],
          },
          {
            id: "diagnostics",
            title: "Diagnostics",
            canvas: {
              preset_id: "tablet",
              runtime_mode: "fit",
            },
            widgets: [
              {
                id: "echo",
                kind: "topic-echo",
                title: "Teleop Echo",
                layout: {
                  x: 40,
                  y: 40,
                  width: 360,
                  height: 180,
                },
                settings: {
                  topic: "/teleop_cmd",
                },
              },
            ],
          },
          {
            id: "placeholder",
            title: "Placeholder",
            canvas: {
              preset_id: "tablet",
              runtime_mode: "fit",
            },
            widgets: [],
          },
        ],
      },
    ],
  };
}

async function moveDigitalOutputWidget() {
  await moveWidget("Digital output");
}

async function moveWidget(widgetTitle: string) {
  const moveHandle = await screen.findByRole("button", { name: `Select and move ${widgetTitle} widget` });
  fireEvent.pointerDown(moveHandle, { button: 0, clientX: 10, clientY: 10 });
  window.dispatchEvent(new MouseEvent("pointermove", { clientX: 50, clientY: 26 }));
  window.dispatchEvent(new MouseEvent("pointerup"));
}
