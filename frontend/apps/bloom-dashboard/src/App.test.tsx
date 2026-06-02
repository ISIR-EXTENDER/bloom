import type { ConfigurationBundle } from "@bloom/api-client";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { App } from "./App";
import type { ConfigurationClient } from "./configurations/configuration-client";

describe("App", () => {
  it("renders the dashboard foundation", () => {
    render(<App configurationClient={createConfigurationClient()} />);

    expect(screen.getByRole("heading", { level: 1, name: /robot interfaces that grow cleanly/i })).toBeVisible();
    expect(screen.getByText(/configurable robot teleoperation/i)).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Architecture promises" })).toBeVisible();
  });

  it("renders the first workflow cards", () => {
    render(<App configurationClient={createConfigurationClient()} />);

    expect(screen.getByRole("heading", { level: 2, name: "Configure" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Control" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Observe" })).toBeVisible();
  });

  it("renders configurations loaded through the API client", async () => {
    render(<App configurationClient={createConfigurationClient()} />);

    expect(screen.getByText("Loading configurations...")).toBeVisible();
    expect(await screen.findByText("Sandbox")).toBeVisible();
    expect(screen.getByText("sandbox")).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Main" })).toBeVisible();
    expect(screen.getByText("Command button")).toBeVisible();
  });

  it("renders an empty configuration state", async () => {
    render(<App configurationClient={createConfigurationClient({ ids: [] })} />);

    expect(await screen.findByText("No configurations found yet.")).toBeVisible();
  });

  it("renders configuration loading failures", async () => {
    render(<App configurationClient={createConfigurationClient({ error: new Error("API unavailable") })} />);

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
    getConfiguration: vi.fn(
      async (id: string): Promise<ConfigurationBundle> => ({
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
                    id: "toggle",
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
            ],
          },
        ],
      }),
    ),
  };
}
