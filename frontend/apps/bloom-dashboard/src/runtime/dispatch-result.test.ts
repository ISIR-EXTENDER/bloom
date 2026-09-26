import { DEFAULT_RUNTIME_POLICY } from "@bloom/api-client";
import { describe, expect, it, vi } from "vitest";
import { isAllowedByPolicy } from "./dispatch-result";
import { dispatchRuntimeActionIntent, type RuntimeActionClient } from "./runtime-action-dispatcher";

describe("the runtime's allowlist", () => {
  // The backend and the Builder let "/ui/" cover its namespace; the runtime matched exactly and blocked it.
  it("lets an entry ending in / cover its namespace, as the backend does", () => {
    expect(isAllowedByPolicy("/ui/widget_lab/gesture", ["/ui/"])).toBe(true);
    expect(isAllowedByPolicy("/uix/gesture", ["/ui/"])).toBe(false);
    expect(isAllowedByPolicy("/anything", ["/"])).toBe(false);
    expect(isAllowedByPolicy("/anything", [])).toBe(true);
  });

  it("publishes on a namespaced topic instead of blocking it", async () => {
    const publishRosTopic = vi.fn(async () => ({
      detail: "ok",
      message_type: "",
      status: "published" as const,
      topic: "",
    }));
    const result = await dispatchRuntimeActionIntent(
      { publishRosTopic } as unknown as RuntimeActionClient,
      {
        messageType: "std_msgs/msg/String",
        payload: { data: "hi" },
        topic: "/ui/gesture",
        type: "topic-publish",
        widgetId: "gesture",
        widgetKind: "gesture-pad",
      },
      { runtimePolicy: { ...DEFAULT_RUNTIME_POLICY, allowed_publish_topics: ["/ui/"] } },
    );
    expect(result.status).toBe("published");
  });
});
