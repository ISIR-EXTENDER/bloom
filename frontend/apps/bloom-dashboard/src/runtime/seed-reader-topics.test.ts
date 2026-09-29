import type { ConfigurationBundle } from "@bloom/api-client";
import { describe, expect, it } from "vitest";
import petanqueAdmin from "../../../../../backend/seed/applications/petanque-admin.json";
import sandbox from "../../../../../backend/seed/applications/sandbox.json";
import { resolveCameraStreamTargets } from "./camera-stream";
import { createRuntimeTopicSubscriptionRequests } from "./runtime-topic-data";

const screensOf = (bundle: unknown) =>
  (bundle as ConfigurationBundle).applications.flatMap((application) => application.screens);

/** The rollback apps' readers reach their robot-side topics through the same subscription rule as the rest. */
describe("what the shipped rollback apps read", () => {
  it("subscribes the Sandbox app to the hub's analogue and digital inputs", () => {
    const topics = screensOf(sandbox).flatMap((screen) =>
      createRuntimeTopicSubscriptionRequests(screen).map((request) => [request.topic, request.message_type]),
    );
    expect(topics).toContainEqual(["/hub/analogic_input", "std_msgs/msg/Float32MultiArray"]);
    expect(topics).toContainEqual(["/hub/digital_input", "std_msgs/msg/Float32MultiArray"]);
  });

  it("opens a camera socket on the Petanque measure's result image", () => {
    const targets = screensOf(petanqueAdmin).flatMap((screen) => resolveCameraStreamTargets(screen));
    expect(targets.map((target) => target.topic)).toContain("/petanque/measure/result_image/compressed");
  });
});
