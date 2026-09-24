#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const fixturePath = resolve(process.argv[2] ?? "backend/seed/applications/sandbox.json");
const bundle = JSON.parse(readFileSync(fixturePath, "utf8"));
const app = bundle.applications?.find((candidate) => candidate.id === "sandbox");

/** qontrol_controller's own speed input, named as both robot configs name it. */
const MAX_LINEAR_SPEED = "/explorer_user_interfaces/rqt_armcontrol/max_linear_speed";

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
    binding?.value_mapping?.target_topic === "/joystick_cartesian_command",
    `expected /joystick_cartesian_command, got ${binding?.value_mapping?.target_topic}`,
  );
  assert(`${id} teleop mode`, binding?.value_mapping?.mode === mode, `expected mode ${mode}`);
}

/**
 * The shaping mode, as cartesian_manager names it.
 *
 * These were B1/B2 toggles publishing the old extender_msgs TeleopCommand enum (0 and 3) on
 * /cmd/mode, which nothing in the ISIR stack has subscribed to since sandbox_controller was
 * replaced. The manager takes a string on /mode_request instead.
 */
function requireGeometricToggle(id) {
  const found = requireWidget(id, "toggle");
  if (!found) return;
  assert(`${id} starts off`, setting(found, "initialValue") === false, "initialValue must stay false");
  assert(`${id} topic`, setting(found, "topic") === "/mode_request", `got ${setting(found, "topic")}`);
  assert(`${id} message type`, setting(found, "messageType") === "std_msgs/msg/String", "expected String");
  assert(
    `${id} returns to geometric/both`,
    String(setting(found, "offPayload")).includes("geometric/both"),
    "off must request geometric/both",
  );
  assert(
    `${id} requests a shaper`,
    /geometric\/(jaco|snake)/.test(String(setting(found, "onPayload"))),
    "on must request geometric/jaco or geometric/snake",
  );
}

/** A slider that contributes one axis to the composed twist instead of publishing a scalar. */
function requireTeleopAxis(id, component) {
  const found = requireWidget(id, "slider");
  if (!found) return;
  const binding = setting(found, "runtime_binding");
  assert(`${id} teleop adapter`, binding?.adapter === "teleop", `expected teleop adapter, got ${binding?.adapter}`);
  assert(
    `${id} teleop target`,
    binding?.value_mapping?.target_topic === "/joystick_cartesian_command",
    `expected /joystick_cartesian_command, got ${binding?.value_mapping?.target_topic}`,
  );
  assert(
    `${id} drives ${component}`,
    binding?.axis_mapping?.value?.component === component,
    `expected ${component}, got ${binding?.axis_mapping?.value?.component}`,
  );
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

for (const id of ["sandbox_control", "control_panel", "snake_control", "visual_servoing", "visual_servoing_monitor"]) {
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

// Max speed is a qontrol_controller input, not a sandbox_controller one.
for (const id of ["sandbox-max-velocity", "control-panel-max-velocity"]) {
  requireTopicWidget(id, "slider", MAX_LINEAR_SPEED, "std_msgs/msg/Float64");
  requireTopicBinding(id, MAX_LINEAR_SPEED, "std_msgs/msg/Float64");
}

// The height and pivot sliders contribute axes to the composed twist rather than publishing a
// scalar of their own, which is what cartesian_manager consumes.
for (const [id, component] of [
  ["sandbox-z", "linear_z"],
  ["control-panel-z", "linear_z"],
  ["sandbox-rz", "angular_z"],
  ["control-panel-rz", "angular_z"],
]) {
  requireTeleopAxis(id, component);
}

for (const id of ["sandbox-gripper", "control-panel-gripper"]) {
  requireTopicWidget(id, "toggle", "/gripper_controller/commands", "std_msgs/msg/Float64MultiArray");
}

for (const id of ["sandbox-mode", "control-panel-mode", "snake-mode-toggle"]) {
  requireGeometricToggle(id);
}

const snakeHold = requireWidget("snake-hold", "command-button");
if (snakeHold) {
  assert("snake hold topic", setting(snakeHold, "topic") === "/mode_request", "expected /mode_request");
  assert(
    "snake hold press payload",
    setting(snakeHold, "payload")?.data === "geometric/snake",
    "press must request geometric/snake",
  );
  assert(
    "snake hold release payload",
    setting(snakeHold, "releasedPayload")?.data === "geometric/both",
    "release must return to geometric/both",
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

const servoPlot = requireWidget("servo-output-plot", "plot-board");
const servoSeries = (setting(servoPlot, "series") ?? []).map(
  (entry) => `${entry.topic}:${entry.message_type}:${entry.field_path}`,
);
for (const topic of ["/visual_servoing/velocity_command", "/visual_servoing/error_TAGtoTAGd"]) {
  for (const axis of ["x", "y", "z"]) {
    const expected = `${topic}:geometry_msgs/msg/TwistStamped:twist.linear.${axis}`;
    assert(`servo output plots ${topic} ${axis}`, servoSeries.includes(expected), `missing ${expected}`);
  }
}

for (const topic of [
  "/gripper_controller/commands",
  MAX_LINEAR_SPEED,
  "/mode_request",
  "/ui/visual_servoing/on",
  "/ui/visual_servoing/save",
]) {
  requirePolicyAllows(topic);
}

// Nothing in the ISIR stack subscribes to the sandbox_controller family any more.
for (const topic of app?.runtime_policy?.allowed_publish_topics ?? []) {
  assert(
    `policy has retired ${topic}`,
    !topic.startsWith("/cmd/") && !topic.startsWith("/teleop_config/") && !topic.startsWith("/sandbox/"),
    "belongs to the previous architecture",
  );
}
requirePolicyAllows("/joystick_cartesian_command", "teleop");
requirePolicyAllows("/mode_request", "publish");

// tools/hub documents /hub/digital_output as [pin, state, ...]; pin 13 is the board's own LED.
const hubOutput = widget("sandbox-hub-output")?.widget;
assert("hub output toggle exists", Boolean(hubOutput), "missing sandbox-hub-output");
assert("hub output topic", setting(hubOutput, "topic") === "/hub/digital_output", "expected /hub/digital_output");
assert(
  "hub output type",
  setting(hubOutput, "messageType") === "std_msgs/msg/Float32MultiArray",
  "hub.py subscribes Float32MultiArray",
);
assert(
  "hub output on payload",
  /\[\s*13\s*,\s*1\s*\]/.test(String(setting(hubOutput, "onPayload"))),
  "expected [13, 1]",
);
requirePolicyAllows("/hub/digital_output", "publish");

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
