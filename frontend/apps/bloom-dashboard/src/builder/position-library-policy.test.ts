import type { ApplicationConfig, WidgetConfig } from "@bloom/api-client";
import { DEFAULT_RUNTIME_POLICY } from "@bloom/api-client";
import { describe, expect, it } from "vitest";
import { syncPublishPolicy } from "./widget-publish-route";

const library: WidgetConfig = {
  id: "poses",
  kind: "position-library",
  title: "Saved poses",
  layout: { x: 0, y: 0, width: 460, height: 380 },
  settings: { jointStateTopic: "/joint_states", eePoseTopic: "/ee_pose", go_to: true, show_details: false },
};

describe("a position library with Go to in the app's publish policy", () => {
  it("adds nothing: the pose target is reserved to the server's Go to route, never an app's publish", () => {
    const application = {
      id: "app",
      name: "App",
      action_presets: [],
      runtime_policy: { ...DEFAULT_RUNTIME_POLICY, allowed_publish_topics: ["/mode_request"] },
      screens: [{ id: "s", title: "S", canvas: { preset_id: "hd", runtime_mode: "fit" }, widgets: [library] }],
    } as unknown as ApplicationConfig;

    expect(syncPublishPolicy(application).allowed_publish_topics).toEqual(["/mode_request"]);
  });
});
