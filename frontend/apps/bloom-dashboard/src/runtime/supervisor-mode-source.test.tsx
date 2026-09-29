/**
 * @vitest-environment jsdom
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { createCommandStateServer } from "../test-support/command-state-server";
import { explorerManagerClient } from "../test-support/configuration-client";
import type { RuntimeActionClient } from "./runtime-action-dispatcher";

afterEach(() => {
  cleanup();
  window.location.hash = "";
});

function openMirror(server: ReturnType<typeof createCommandStateServer>) {
  window.history.replaceState(null, "", "#/runtime/supervisor/explorer-manager/explorer-manager");
  const client = {
    addRuntimeCommandStateListener: server.addRuntimeCommandStateListener,
    getRuntimeStopState: vi.fn(async () => ({ asserted: false, detail: "", engaged_at: "", stopped: false })),
    listRosTopicStatus: vi.fn(async () => []),
    publishRosTopic: vi.fn(),
  } satisfies RuntimeActionClient;
  render(<App configurationClient={explorerManagerClient()} runtimeActionClient={client} />);
}

describe("the supervisor mirror's mode", () => {
  it("says the manager reported it when its status is the source, and last requested otherwise", async () => {
    const server = createCommandStateServer();
    openMirror(server);
    // The mirror loads its bundle first; a loaded coverage run takes longer than the default second.
    await screen.findByRole("region", { name: "Supervisor mirror" }, { timeout: 10000 });

    act(() => server.write({ "manager:shaping": "geometric/jaco" }, "operator", "commanded"));
    const asked = await screen.findByText("Last requested mode");
    expect(asked.nextElementSibling?.textContent).toBe("geometric/jaco");

    act(() => server.write({ "manager:shaping": "geometric/jaco" }, "cartesian_manager", "measured"));
    const reported = await screen.findByText("Mode reported by the manager");
    expect(reported.nextElementSibling?.textContent).toBe("geometric/jaco");
    expect(screen.queryByText("Last requested mode")).toBeNull();
  });
});
