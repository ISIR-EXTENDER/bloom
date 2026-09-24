#!/usr/bin/env node

import { openContract } from "./lib/seed-contract.mjs";
import { STACK } from "./lib/stack-topics.mjs";

const { app, assert, finish, requirePolicyAllows, screen, setting, widgets } = openContract({
  name: "Visual-servoing contract",
  appId: "sandbox",
  defaultPath: "backend/seed/applications/sandbox.json",
});

/** Every topic the given kinds read, one entry per series on a plot board. */
function topicsForKinds(kinds) {
  return widgets()
    .filter((entry) => kinds.includes(entry.widget.kind))
    .flatMap((entry) => {
      const topics = Array.isArray(entry.widget.settings?.series)
        ? entry.widget.settings.series.map((series) => series.topic)
        : [entry.widget.settings?.topic];
      return topics.map((topic) => ({
        id: entry.widget.id,
        kind: entry.widget.kind,
        screenId: entry.screen.id,
        topic,
      }));
    })
    .filter((entry) => typeof entry.topic === "string" && entry.topic.length > 0);
}

assert("sandbox app exists", Boolean(app), "missing sandbox app");

for (const screenId of ["control_panel", "visual_servoing", "visual_servoing_monitor"]) {
  assert(`screen ${screenId} exists`, Boolean(screen(screenId)), "missing visual-servoing screen");
}

for (const id of ["control-panel-camera", "servo-camera"]) {
  assert(`${id} is local webcam preview`, setting(id, "source") === "webcam", "expected source=webcam");
  assert(`${id} shows webcam picker`, setting(id, "webcamPicker") === true, "expected webcamPicker=true");
}

assert("servo-camera keeps ROS image topic as metadata", setting("servo-camera", "topic") === "/image_raw");
assert(
  "control panel camera keeps legacy camera topic",
  setting("control-panel-camera", "topic") === "/camera/play_petanque",
);
assert("AprilTag RViz panel is not a browser webcam", setting("servo-rviz", "source") === "placeholder");
assert("AprilTag RViz panel points at detections", setting("servo-rviz", "topic") === STACK.tagDetections);

assert("visual-servoing enable topic", setting("servo-enable", "topic") === STACK.servoOn);
assert("visual-servoing save topic", setting("servo-save", "topic") === STACK.servoSave);

assert("AprilTag monitor topic", setting("servo-topic-monitor-1", "topic") === STACK.tagDetections);
assert(
  "AprilTag monitor message",
  setting("servo-topic-monitor-1", "messageType") === "extender_msgs/msg/SharedControlGoalArray",
);

const servoSeries = (setting("servo-output-plot", "series") ?? []).map((entry) => `${entry.topic}:${entry.field_path}`);
for (const topic of [STACK.servoVelocity, STACK.servoError]) {
  for (const axis of ["x", "y", "z"]) {
    assert(`servo output plots ${topic} ${axis}`, servoSeries.includes(`${topic}:twist.linear.${axis}`));
  }
}

const monitorTopics = topicsForKinds(["topic-echo", "topic-plot", "plot-board"]);
for (const forbiddenTopic of ["/image_raw", "/camera_info"]) {
  assert(
    `UI monitors avoid ${forbiddenTopic}`,
    !monitorTopics.some((entry) => entry.topic === forbiddenTopic),
    `${forbiddenTopic} must stay in the ROS image pipeline, not Bloom topic monitors`,
  );
}

for (const topic of [STACK.tagDetections, STACK.servoVelocity, STACK.servoError]) {
  requirePolicyAllows(topic, "recording");
}
for (const forbiddenTopic of ["/image_raw", "/camera_info"]) {
  assert(
    `recording policy avoids ${forbiddenTopic}`,
    !(app?.runtime_policy?.allowed_recording_topics ?? []).includes(forbiddenTopic),
    `${forbiddenTopic} should not be recorded by the default visual-servoing monitor preset`,
  );
}

for (const topic of [STACK.servoOn, STACK.servoSave]) {
  requirePolicyAllows(topic);
}

finish();
