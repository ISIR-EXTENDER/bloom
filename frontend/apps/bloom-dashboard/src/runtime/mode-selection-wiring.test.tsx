/**
 * @vitest-environment jsdom
 */
import type { ConfigurationBundle } from "@bloom/api-client";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import explorerManagerConfiguration from "../../../../../backend/seed/applications/explorer-manager.json";
import { App } from "../App";
import type { RuntimeActionClient } from "./runtime-action-dispatcher";

/**
 * End to end through the real App state: pressing a mode button must light
 * that button and unlight the others.
 *
 * The pieces were unit tested separately, and all passed, while the buttons
 * still did nothing in the browser. Only a test that goes through App's state
 * catches an intent that never reaches the mode reducer.
 */
function createConfigurationClient() {
  const bundle = explorerManagerConfiguration as unknown as ConfigurationBundle;
  return {
    listConfigurations: vi.fn(async () => ["explorer-manager"]),
    getConfiguration: vi.fn(async (): Promise<ConfigurationBundle> => structuredClone(bundle)),
    upsertConfiguration: vi.fn(async (_id: string, next: ConfigurationBundle) => structuredClone(next)),
    upsertApplication: vi.fn(async (): Promise<ConfigurationBundle> => structuredClone(bundle)),
    deleteApplication: vi.fn(async (): Promise<ConfigurationBundle> => structuredClone(bundle)),
  } as never;
}

const pressedState = (name: RegExp) => screen.getByRole("button", { name }).getAttribute("aria-pressed");

function createRuntimeActionClient() {
  return {
    listRosTopicStatus: vi.fn(async () => [
      {
        name: "/mode_request",
        message_type: "std_msgs/msg/String",
        publisher_count: 1,
        subscription_count: 1,
      },
    ]),
    publishRosTopic: vi.fn(async (request) => ({
      detail: "Published.",
      message_type: request.message_type,
      status: "published" as const,
      topic: request.topic,
    })),
  } satisfies RuntimeActionClient;
}

describe("pressing a mode button", () => {
  it("marks it as the requested mode and clears the others", async () => {
    render(
      <App configurationClient={createConfigurationClient()} runtimeActionClient={createRuntimeActionClient()} />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Runtime: Operate and inspect" }));
    fireEvent.click(await screen.findByRole("button", { name: "Launch Explorer Manager runtime" }));

    expect(await screen.findByRole("button", { name: /^Jaco/ })).toBeTruthy();
    expect(pressedState(/^Jaco/)).toBe("false");
    expect(pressedState(/^Both/)).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: /^Jaco/ }));

    expect(pressedState(/^Jaco/)).toBe("true");
    expect(pressedState(/^Both/)).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: /^Both/ }));

    expect(pressedState(/^Both/)).toBe("true");
    expect(pressedState(/^Jaco/)).toBe("false");
  });
});
