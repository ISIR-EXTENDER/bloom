import type { ConfigurationBundle } from "@bloom/api-client";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { App } from "./App";
import type { ConfigurationClient } from "./configurations/configuration-client";

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

    expect(await screen.findByRole("heading", { level: 2, name: "Choose what to preview" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Main" })).toBeVisible();
    expect(screen.getByText(/Sandbox operator interface/i)).toBeInTheDocument();
    expect(screen.getByText("Command button")).toBeVisible();
  });

  it("switches screens inside the builder workspace", async () => {
    render(<App configurationClient={createConfigurationClient()} />);

    fireEvent.click(screen.getByRole("button", { name: "Builder: Compose screens" }));
    fireEvent.click(await screen.findByRole("button", { name: /Diagnostics/i }));

    expect(screen.getByRole("heading", { level: 2, name: "Diagnostics" })).toBeVisible();
    expect(screen.getByText("/teleop_cmd")).toBeVisible();
    expect(screen.getByText("Waiting for messages...")).toBeVisible();
  });

  it("records runtime action intents from interactive widgets", async () => {
    render(<App configurationClient={createConfigurationClient()} />);

    fireEvent.click(screen.getByRole("button", { name: "Runtime: Operate and inspect" }));
    fireEvent.click(await screen.findByRole("button", { name: "Send" }));

    expect(screen.getByRole("heading", { level: 2, name: "Action intents" })).toBeVisible();
    expect(screen.getByText("topic-publish")).toBeVisible();
    expect(screen.getByText(/"widgetId": "command"/)).toBeVisible();
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

function createConfigurationClient(options: { ids?: string[]; error?: Error } = {}): ConfigurationClient {
  const ids = options.ids ?? ["sandbox"];

  return {
    listConfigurations: vi.fn(async () => {
      if (options.error) {
        throw options.error;
      }
      return ids;
    }),
    getConfiguration: vi.fn(async (id: string): Promise<ConfigurationBundle> => createConfigurationBundle(id)),
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
                id: "command",
                kind: "command-button",
                title: "Toggle",
                layout: {
                  x: 24,
                  y: 32,
                  width: 220,
                  height: 96,
                },
                settings: {
                  topic: "/ui/ros_toggle",
                  payloadOn: { data: [13, 1] },
                  payloadOff: { data: [13, 0] },
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
        ],
      },
    ],
  };
}
