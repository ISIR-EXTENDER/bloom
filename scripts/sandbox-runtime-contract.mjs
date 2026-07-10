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

function setting(widget, key) {
  return widget?.settings?.[key];
}

function screen(id) {
  return app?.screens?.find((candidate) => candidate.id === id);
}

function widget(id) {
  for (const candidateScreen of app?.screens ?? []) {
    const candidateWidget = candidateScreen.widgets?.find((item) => item.id === id);
    if (candidateWidget) {
      return { screen: candidateScreen, widget: candidateWidget };
    }
  }
  return null;
}

function requireWidget(id, kind) {
  const found = widget(id);
  assert(`widget ${id} exists`, Boolean(found), "missing widget");
  if (!found) return null;
  assert(`widget ${id} kind`, found.widget.kind === kind, `expected ${kind}, got ${found.widget.kind}`);
  return found.widget;
}

function requireTopicWidget(id, kind, topic, messageType) {
  const found = requireWidget(id, kind);
  if (!found) return;
  assert(`${id} topic`, setting(found, "topic") === topic, `expected ${topic}, got ${setting(found, "topic")}`);
  assert(
    `${id} message type`,
    setting(found, "messageType") === messageType,
    `expected ${messageType}, got ${setting(found, "messageType")}`,
  );
}

function requireTopicBinding(id, topic, messageType) {
  const found = widget(id)?.widget;
  if (!found) return;
  const binding = setting(found, "runtime_binding");
  assert(`${id} runtime adapter`, binding?.adapter === "topic", `expected topic adapter, got ${binding?.adapter}`);
  assert(`${id} runtime target`, binding?.target === topic, `expected ${topic}, got ${binding?.target}`);
  assert(
    `${id} runtime message type`,
    binding?.value_mapping?.message_type === messageType,
    `expected ${messageType}, got ${binding?.value_mapping?.message_type}`,
  );
}

function requireTeleopJoystick(id, mode) {
  const found = requireWidget(id, "joystick");
  if (!found) return;
  const binding = setting(found, "runtime_binding");
  assert(`${id} teleop adapter`, binding?.adapter === "teleop", `expected teleop adapter, got ${binding?.adapter}`);
  assert(
    `${id} teleop target`,
    binding?.value_mapping?.target_topic === "/teleop_cmd",
    `expected /teleop_cmd, got ${binding?.value_mapping?.target_topic}`,
  );
  assert(`${id} teleop mode`, binding?.value_mapping?.mode === mode, `expected mode ${mode}`);
}

function requireModeToggle(id) {
  const found = requireWidget(id, "toggle");
  if (!found) return;
  assert(`${id} starts in B1`, setting(found, "initialValue") === false, "initialValue must stay false");
  assert(`${id} topic`, setting(found, "topic") === "/cmd/mode", `got ${setting(found, "topic")}`);
  assert(`${id} message type`, setting(found, "messageType") === "std_msgs/msg/Int32", "expected Int32");
  assert(`${id} B2 payload`, setting(found, "onPayload")?.data === 3, "onPayload.data must be 3");
  assert(`${id} B1 payload`, setting(found, "offPayload")?.data === 0, "offPayload.data must be 0");
}

function requirePolicyAllows(topic, kind = "publish") {
  const key = kind === "teleop" ? "allowed_teleop_targets" : "allowed_publish_topics";
  const values = app?.runtime_policy?.[key] ?? [];
  assert(`runtime policy allows ${topic}`, values.includes(topic), `${key} does not include ${topic}`);
}

assert("sandbox app exists", Boolean(app), "missing sandbox app");
assert(
  "sandbox uses Extender light theme",
  app?.theme?.preset_id === "extender-ui",
  "theme preset must be extender-ui",
);

for (const id of [
  "sandbox_control",
  "sandbox_teleop_config",
  "control_panel",
  "snake_control",
  "visual_servoing",
  "visual_servoing_monitor",
]) {
  assert(`screen ${id} exists`, Boolean(screen(id)), "missing screen");
}

for (const [id, mode] of [
  ["sandbox-translation", 3],
  ["control-panel-translation", 3],
  ["snake-joystick", 3],
  ["sandbox-rotation", 1],
  ["control-panel-rotation", 1],
]) {
  requireTeleopJoystick(id, mode);
}

for (const [id, topic] of [
  ["sandbox-max-velocity", "/cmd/max_velocity"],
  ["control-panel-max-velocity", "/cmd/max_velocity"],
  ["sandbox-z", "/cmd/joystick_z"],
  ["control-panel-z", "/cmd/joystick_z"],
  ["sandbox-rz", "/cmd/joystick_rz"],
  ["control-panel-rz", "/cmd/joystick_rz"],
]) {
  requireTopicWidget(id, "slider", topic, "std_msgs/msg/Float64");
  requireTopicBinding(id, topic, "std_msgs/msg/Float64");
}

for (const id of ["sandbox-gripper", "control-panel-gripper"]) {
  requireTopicWidget(id, "toggle", "/cmd/gripper", "std_msgs/msg/Bool");
}

for (const id of ["sandbox-mode", "control-panel-mode", "snake-mode-toggle"]) {
  requireModeToggle(id);
}

const snakeHold = requireWidget("snake-hold", "command-button");
if (snakeHold) {
  assert("snake hold topic", setting(snakeHold, "topic") === "/snake_control/enable", "expected snake enable topic");
  assert("snake hold press payload", setting(snakeHold, "payload") === "{data: true}", "expected true press payload");
  assert(
    "snake hold release payload",
    setting(snakeHold, "releasedPayload") === "{data: false}",
    "expected false release payload",
  );
}

requireTopicWidget("control-panel-camera", "camera", "/camera/play_petanque", undefined);
requireTopicWidget("servo-camera", "camera", "/image_raw", undefined);
requireTopicWidget("control-panel-servo-enable", "toggle", "/ui/visual_servoing/on", "std_msgs/msg/Bool");
requireTopicWidget("servo-enable", "toggle", "/ui/visual_servoing/on", "std_msgs/msg/Bool");
requireTopicWidget("control-panel-servo-save", "command-button", "/ui/visual_servoing/save", "std_msgs/msg/String");
requireTopicWidget("servo-save", "command-button", "/ui/visual_servoing/save", "std_msgs/msg/String");

for (const [id, targetScreenId] of [
  ["servo-open-monitor", "visual_servoing_monitor"],
  ["servo-monitor-back", "visual_servoing"],
]) {
  const found = requireWidget(id, "command-button");
  if (found) {
    assert(
      `${id} navigation target`,
      setting(found, "targetScreenId") === targetScreenId,
      `expected ${targetScreenId}`,
    );
  }
}

requireTopicWidget(
  "servo-topic-monitor-1",
  "topic-echo",
  "/tag_detections",
  "extender_msgs/msg/SharedControlGoalArray",
);

for (const axis of ["x", "y", "z"]) {
  requireTopicWidget(
    `servo-velocity-linear-${axis}`,
    "topic-plot",
    "/visual_servoing/velocity_command",
    "geometry_msgs/msg/TwistStamped",
  );
  requireTopicWidget(
    `servo-error-linear-${axis}`,
    "topic-plot",
    "/visual_servoing/error_TAGtoTAGd",
    "geometry_msgs/msg/TwistStamped",
  );
}

for (const topic of [
  "/cmd/gripper",
  "/cmd/joystick_rz",
  "/cmd/joystick_z",
  "/cmd/max_velocity",
  "/cmd/mode",
  "/sandbox/digital_output",
  "/snake_control/enable",
  "/ui/visual_servoing/on",
  "/ui/visual_servoing/save",
]) {
  requirePolicyAllows(topic);
}
requirePolicyAllows("/teleop_cmd", "teleop");

if (failures.length > 0) {
  console.error("Sandbox runtime contract failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

for (const label of passed) {
  console.log(`ok: ${label}`);
}
console.log(`Sandbox runtime contract passed for ${fixturePath}`);
