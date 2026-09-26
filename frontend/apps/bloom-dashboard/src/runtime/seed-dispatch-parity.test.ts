import type { ApplicationConfig } from "@bloom/api-client";
import { createWidgetActionIntent, type WidgetActionEvent } from "@bloom/widgets";
import { describe, expect, it } from "vitest";
import { dispatchRuntimeActionIntent, type RuntimeActionClient } from "./runtime-action-dispatcher";
import before from "./seed-dispatch-parity.fixture.json";

// What every shipped seed's buttons and toggles sent before the preset-precedence fix; a change here is a behaviour change.
const seeds = import.meta.glob<{ applications: ApplicationConfig[] }>(
  "../../../../../backend/seed/applications/*.json",
  { eager: true, import: "default" },
);

function recordingClient(): RuntimeActionClient {
  const ok = async (request: unknown) => ({ detail: "ok", status: "published", ...(request as object) });
  return {
    publishRosTopic: ok,
    dispatchRuntimeAction: async () => ({ detail: "ok", status: "accepted" }),
    setRosParameter: ok,
  } as unknown as RuntimeActionClient;
}

async function collectRequests(): Promise<Record<string, unknown>> {
  const map: Record<string, unknown> = {};
  for (const [path, seed] of Object.entries(seeds)) {
    for (const application of seed.applications) {
      for (const screen of application.screens) {
        for (const widget of screen.widgets) {
          const events: WidgetActionEvent[] =
            widget.kind === "command-button"
              ? [{ type: "press" }]
              : widget.kind === "toggle"
                ? [
                    { nextState: "on", type: "toggle" },
                    { nextState: "off", type: "toggle" },
                  ]
                : [];
          for (const event of events) {
            const intent = createWidgetActionIntent(widget, event);
            const result = await dispatchRuntimeActionIntent(recordingClient(), intent, {
              actionPresets: application.action_presets,
              appId: application.id,
              configId: "seed",
              onCommandFrameChange: () => undefined,
              runtimePolicy: application.runtime_policy,
            });
            const key = `${path.split("/").pop()}:${application.id}:${screen.id}:${widget.id}:${"nextState" in event ? event.nextState : "press"}`;
            map[key] = { request: result.request ?? null, status: result.status, type: intent.type };
          }
        }
      }
    }
  }
  return map;
}

describe("the shipped seeds", () => {
  it("dispatch exactly the request per button and toggle they did before", async () => {
    const requests = await collectRequests();
    expect(Object.keys(requests).length).toBeGreaterThan(50);
    expect(requests).toEqual(before);
  });
});
