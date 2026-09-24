#!/usr/bin/env node
/**
 * Visual servoing app contract.
 *
 * Robin's AprilTag flow on the current stack (docs/validation/2026-07-10-robin-visual-servoing-contract.md):
 * the camera stays in the ROS image pipeline, the UI enables and saves through /ui/visual_servoing/*, the
 * node answers on /visual_servoing/velocity_command and /visual_servoing/error_TAGtoTAGd, and the tag list
 * on /tag_detections. The gripper camera reads camera_interface's convention topic.
 */

import { openContract } from "./lib/seed-contract.mjs";
import { STACK } from "./lib/stack-topics.mjs";

const { app, assert, finish, requirePolicyAllows, screen, screens, setting } = openContract({
  name: "Visual servoing app contract",
  appId: "visual-servoing",
  defaultPath: "backend/seed/applications/visual-servoing.json",
});

assert("app exists", Boolean(app), "missing visual-servoing");
assert("app is active", app?.lifecycle === "active", `got ${app?.lifecycle}`);
for (const id of ["servo", "approach", "monitor"]) {
  const found = screen(id);
  assert(`screen ${id} exists`, Boolean(found), "missing screen");
  assert(
    `screen ${id} reserves STOP`,
    (found?.reserved_regions ?? []).some((region) => region.id === "stop" && region.owner === "runtime-chrome"),
    "STOP is chrome in a reserved region on every screen",
  );
}

// The gripper view: a ROS camera on the convention every driver is mapped to.
for (const id of ["servo-camera", "approach-camera"]) {
  assert(`${id} is a ROS camera`, setting(id, "source") === "ros-topic", `got ${setting(id, "source")}`);
  assert(
    `${id} reads the camera_interface topic`,
    setting(id, "topic") === STACK.cameraImage,
    `got ${setting(id, "topic")}`,
  );
}

// Robin's two controls.
assert("enable topic", setting("servo-enable", "topic") === STACK.servoOn);
assert("enable type", setting("servo-enable", "messageType") === "std_msgs/msg/Bool");
assert("enable on payload", setting("servo-enable", "onPayload") === "{data: true}");
assert("save topic", setting("servo-save", "topic") === STACK.servoSave);
assert("save payload", setting("servo-save", "payload")?.data === "save");

// The node's answers, as displays only.
assert("tags echo topic", setting("servo-tags", "topic") === STACK.tagDetections);
assert("monitor tags topic", setting("monitor-tags", "topic") === STACK.tagDetections);
const monitorSeries = setting("monitor-plot", "series") ?? [];
for (const axis of ["x", "y", "z"]) {
  assert(
    `velocity ${axis} plotted`,
    monitorSeries.some((entry) => entry.topic === STACK.servoVelocity && entry.field_path === `twist.linear.${axis}`),
  );
  assert(
    `error ${axis} plotted`,
    monitorSeries.some((entry) => entry.topic === STACK.servoError && entry.field_path === `twist.linear.${axis}`),
  );
}

// The manager's input gates, live parameters on the Approach screen.
for (const [id, parameter] of [
  ["approach-joystick-input", "inputs.joystick.enabled"],
  ["approach-servo-input", "inputs.visual_servoing.enabled"],
]) {
  const binding = setting(id, "runtime_binding");
  assert(`${id} is a parameter toggle`, binding?.adapter === "parameter", `got ${binding?.adapter}`);
  assert(
    `${id} sets ${parameter}`,
    binding?.value_mapping?.parameter === parameter,
    `got ${binding?.value_mapping?.parameter}`,
  );
  assert(
    `policy allows /cartesian_manager:${parameter}`,
    (app?.runtime_policy?.allowed_parameters ?? []).includes(`/cartesian_manager:${parameter}`),
  );
}

// Approach drives through the manager like every other app.
assert("approach translation is teleop", setting("approach-translation", "runtime_binding")?.adapter === "teleop");
assert(
  "approach translation targets the manager",
  setting("approach-translation", "runtime_binding")?.value_mapping?.target_topic === STACK.twist,
);

// The image pipeline stays in ROS: no raw image topic reaches a monitor or a recording.
const monitors = screens().flatMap((entry) =>
  entry.widgets.filter((item) => ["topic-echo", "topic-plot"].includes(item.kind)).map((item) => item.settings.topic),
);
for (const forbidden of ["/image_raw", "/camera_info", "/camera/color/image_raw"]) {
  assert(`monitors avoid ${forbidden}`, !monitors.includes(forbidden));
  assert(`recording avoids ${forbidden}`, !(app?.runtime_policy?.allowed_recording_topics ?? []).includes(forbidden));
}
for (const topic of [STACK.servoOn, STACK.servoSave]) {
  requirePolicyAllows(topic);
}
for (const topic of [STACK.tagDetections, STACK.servoVelocity, STACK.servoError]) {
  requirePolicyAllows(topic, "recording");
}

finish();
