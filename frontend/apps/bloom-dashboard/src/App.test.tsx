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
  options: { bundles?: Record<string, ConfigurationBundle>; ids?: string[]; error?: Error } = {},
): ConfigurationClient {
  const ids = options.ids ?? ["sandbox"];

  return {
    listConfigurations: vi.fn(async () => {
      if (options.error) {
        throw options.error;
      }
      return ids;
    }),
    getConfiguration: vi.fn(async (id: string): Promise<ConfigurationBundle> => {
      return options.bundles?.[id] ?? createConfigurationBundle(id);
    }),
  };
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
