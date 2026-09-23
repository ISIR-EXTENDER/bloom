#!/usr/bin/env node
/**
 * Visual servoing app contract.
 *
 * Robin's AprilTag flow on the current stack (docs/validation/2026-07-10-robin-visual-servoing-contract.md):
 * the camera stays in the ROS image pipeline, the UI enables and saves through /ui/visual_servoing/*, the
 * node answers on /visual_servoing/velocity_command and /visual_servoing/error_TAGtoTAGd, and the tag list
 * on /tag_detections. The gripper camera reads camera_interface's convention topic.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const fixturePath = resolve(process.argv[2] ?? "backend/seed/applications/visual-servoing.json");
const bundle = JSON.parse(readFileSync(fixturePath, "utf8"));
const app = bundle.applications?.find((candidate) => candidate.id === "visual-servoing");

const failures = [];
const passed = [];
function assert(label, condition, detail = "expected condition to be true") {
  (condition ? passed : failures).push(condition ? label : `${label}: ${detail}`);
}
function widget(id) {
  for (const screen of app?.screens ?? []) {
    const found = screen.widgets?.find((candidate) => candidate.id === id);
    if (found) return found;
  }
  return null;
}
const setting = (id, key) => widget(id)?.settings?.[key];

assert("app exists", Boolean(app), "missing visual-servoing");
assert("app is active", app?.lifecycle === "active", `got ${app?.lifecycle}`);
for (const id of ["servo", "approach", "monitor"]) {
  const screen = app?.screens?.find((candidate) => candidate.id === id);
  assert(`screen ${id} exists`, Boolean(screen), "missing screen");
  assert(
    `screen ${id} reserves STOP`,
    (screen?.reserved_regions ?? []).some((region) => region.id === "stop" && region.owner === "runtime-chrome"),
    "STOP is chrome in a reserved region on every screen",
  );
}

// The gripper view: a ROS camera on the convention every driver is mapped to.
for (const id of ["servo-camera", "approach-camera"]) {
  assert(`${id} is a ROS camera`, setting(id, "source") === "ros-topic", `got ${setting(id, "source")}`);
  assert(
    `${id} reads the camera_interface topic`,
    setting(id, "topic") === "/camera/color/image_raw/compressed",
    `got ${setting(id, "topic")}`,
  );
}

// Robin's two controls.
assert("enable topic", setting("servo-enable", "topic") === "/ui/visual_servoing/on");
assert("enable type", setting("servo-enable", "messageType") === "std_msgs/msg/Bool");
assert("enable on payload", setting("servo-enable", "onPayload") === "{data: true}");
assert("save topic", setting("servo-save", "topic") === "/ui/visual_servoing/save");
assert("save payload", setting("servo-save", "payload")?.data === "save");

// The node's answers, as displays only.
assert("tags echo topic", setting("servo-tags", "topic") === "/tag_detections");
assert("monitor tags topic", setting("monitor-tags", "topic") === "/tag_detections");
const monitorSeries = setting("monitor-plot", "series") ?? [];
for (const axis of ["x", "y", "z"]) {
  assert(
    `velocity ${axis} plotted`,
    monitorSeries.some(
      (entry) => entry.topic === "/visual_servoing/velocity_command" && entry.field_path === `twist.linear.${axis}`,
    ),
  );
  assert(
    `error ${axis} plotted`,
    monitorSeries.some(
      (entry) => entry.topic === "/visual_servoing/error_TAGtoTAGd" && entry.field_path === `twist.linear.${axis}`,
    ),
  );
}

// Approach drives through the manager like every other app.
assert("approach translation is teleop", setting("approach-translation", "runtime_binding")?.adapter === "teleop");
assert(
  "approach translation targets the manager",
  setting("approach-translation", "runtime_binding")?.value_mapping?.target_topic === "/joystick_cartesian_command",
);

// The image pipeline stays in ROS: no raw image topic reaches a monitor or a recording.
const monitors = (app?.screens ?? []).flatMap((screen) =>
  screen.widgets
    .filter((entry) => ["topic-echo", "topic-plot"].includes(entry.kind))
    .map((entry) => entry.settings.topic),
);
for (const forbidden of ["/image_raw", "/camera_info", "/camera/color/image_raw"]) {
  assert(`monitors avoid ${forbidden}`, !monitors.includes(forbidden));
  assert(`recording avoids ${forbidden}`, !(app?.runtime_policy?.allowed_recording_topics ?? []).includes(forbidden));
}
for (const topic of ["/ui/visual_servoing/on", "/ui/visual_servoing/save"]) {
  assert(`policy allows ${topic}`, (app?.runtime_policy?.allowed_publish_topics ?? []).includes(topic));
}
for (const topic of ["/tag_detections", "/visual_servoing/velocity_command", "/visual_servoing/error_TAGtoTAGd"]) {
  assert(`policy records ${topic}`, (app?.runtime_policy?.allowed_recording_topics ?? []).includes(topic));
}

if (failures.length > 0) {
  console.error("Visual servoing app contract failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
for (const label of passed) console.log(`ok: ${label}`);
console.log(`Visual servoing app contract passed for ${fixturePath}`);
