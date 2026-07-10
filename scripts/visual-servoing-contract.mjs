#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const fixturePath = resolve(process.argv[2] ?? "tests/fixtures/sandbox-v0-configuration-bundle.json");
const bundle = JSON.parse(readFileSync(fixturePath, "utf8"));
const app = bundle.applications?.find((candidate) => candidate.id === "sandbox");
const failures = [];
const passed = [];

function ok(label) {
  passed.push(label);
}

function fail(label, detail) {
  failures.push(`${label}: ${detail}`);
}

function assert(label, condition, detail = "expected condition to be true") {
  if (condition) {
    ok(label);
  } else {
    fail(label, detail);
  }
}

function widgets() {
  return (app?.screens ?? []).flatMap((screen) =>
    (screen.widgets ?? []).map((widget) => ({
      screen,
      widget,
    })),
  );
}

function widget(id) {
  return widgets().find((entry) => entry.widget.id === id)?.widget ?? null;
}

function setting(id, key) {
  return widget(id)?.settings?.[key];
}

function topicsForKinds(kinds) {
  return widgets()
    .filter((entry) => kinds.includes(entry.widget.kind))
    .map((entry) => ({
      id: entry.widget.id,
      kind: entry.widget.kind,
      screenId: entry.screen.id,
      topic: entry.widget.settings?.topic,
    }))
    .filter((entry) => typeof entry.topic === "string" && entry.topic.length > 0);
}

assert("sandbox app exists", Boolean(app), "missing sandbox app");

for (const screenId of ["control_panel", "visual_servoing", "visual_servoing_monitor"]) {
  assert(
    `screen ${screenId} exists`,
    Boolean(app?.screens?.some((screen) => screen.id === screenId)),
    "missing visual-servoing screen",
  );
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
assert("AprilTag RViz panel points at detections", setting("servo-rviz", "topic") === "/tag_detections");

assert("visual-servoing enable topic", setting("servo-enable", "topic") === "/ui/visual_servoing/on");
assert("visual-servoing save topic", setting("servo-save", "topic") === "/ui/visual_servoing/save");

assert("AprilTag monitor topic", setting("servo-topic-monitor-1", "topic") === "/tag_detections");
assert(
  "AprilTag monitor message",
  setting("servo-topic-monitor-1", "messageType") === "extender_msgs/msg/SharedControlGoalArray",
);

for (const axis of ["x", "y", "z"]) {
  assert(
    `velocity ${axis} topic`,
    setting(`servo-velocity-linear-${axis}`, "topic") === "/visual_servoing/velocity_command",
  );
  assert(`velocity ${axis} field`, setting(`servo-velocity-linear-${axis}`, "fieldPath") === `twist.linear.${axis}`);
  assert(`error ${axis} topic`, setting(`servo-error-linear-${axis}`, "topic") === "/visual_servoing/error_TAGtoTAGd");
  assert(`error ${axis} field`, setting(`servo-error-linear-${axis}`, "fieldPath") === `twist.linear.${axis}`);
}

const monitorTopics = topicsForKinds(["topic-echo", "topic-plot"]);
for (const forbiddenTopic of ["/image_raw", "/camera_info"]) {
  assert(
    `UI monitors avoid ${forbiddenTopic}`,
    !monitorTopics.some((entry) => entry.topic === forbiddenTopic),
    `${forbiddenTopic} must stay in the ROS image pipeline, not Bloom topic monitors`,
  );
}

const recordingTopics = app?.runtime_policy?.allowed_recording_topics ?? [];
for (const requiredTopic of [
  "/tag_detections",
  "/visual_servoing/velocity_command",
  "/visual_servoing/error_TAGtoTAGd",
]) {
  assert(`recording policy includes ${requiredTopic}`, recordingTopics.includes(requiredTopic));
}
for (const forbiddenTopic of ["/image_raw", "/camera_info"]) {
  assert(
    `recording policy avoids ${forbiddenTopic}`,
    !recordingTopics.includes(forbiddenTopic),
    `${forbiddenTopic} should not be recorded by the default visual-servoing monitor preset`,
  );
}

const publishTopics = app?.runtime_policy?.allowed_publish_topics ?? [];
for (const topic of ["/ui/visual_servoing/on", "/ui/visual_servoing/save"]) {
  assert(`publish policy includes ${topic}`, publishTopics.includes(topic));
}

if (failures.length > 0) {
  console.error("Visual-servoing contract failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

for (const label of passed) {
  console.log(`ok: ${label}`);
}
console.log(`Visual-servoing contract passed for ${fixturePath}`);
