import { describe, expect, it, vi } from "vitest";

import type { RuntimeActionClient } from "./runtime-action-dispatcher";
import { createSupervisorRuntimeClient } from "./supervisor-client";

describe("createSupervisorRuntimeClient", () => {
  it("projects only status reads and connection observation", () => {
    const client = {
      addRuntimeLinkStateListener: vi.fn(),
      dispatchRuntimeAction: vi.fn(),
      engageRuntimeStop: vi.fn(),
      ensureRuntimeConnected: vi.fn(),
      getRuntimeStopState: vi.fn(),
      listRosTopicStatus: vi.fn(),
      publishRosTopic: vi.fn(),
      resumeRuntimeStop: vi.fn(),
      sendTeleopCommand: vi.fn(),
    } as unknown as RuntimeActionClient;

    const supervisor = createSupervisorRuntimeClient(client);

    expect(Object.keys(supervisor).sort()).toEqual([
      "addRuntimeLinkStateListener",
      "ensureRuntimeConnected",
      "getRuntimeStopState",
      "listRosTopicStatus",
    ]);
    expect("publishRosTopic" in supervisor).toBe(false);
    expect("dispatchRuntimeAction" in supervisor).toBe(false);
    expect("engageRuntimeStop" in supervisor).toBe(false);
    expect("resumeRuntimeStop" in supervisor).toBe(false);
    expect("sendTeleopCommand" in supervisor).toBe(false);
  });
});
