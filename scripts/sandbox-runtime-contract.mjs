#!/usr/bin/env node

import { openContract } from "./lib/seed-contract.mjs";
import { STACK } from "./lib/stack-topics.mjs";

const contract = openContract({
  name: "Sandbox runtime contract",
  appId: "sandbox",
  defaultPath: "backend/seed/applications/sandbox.json",
});
const {
  app,
  assert,
  finish,
  requirePolicyAllows,
  requireTeleopAxis,
  requireTeleopJoystick,
  requireTopicWidget,
  requireWidget,
  screen,
  setting,
  widget,
} = contract;

function requireTopicBinding(id, topic, messageType) {
  const binding = setting(id, "runtime_binding");
  if (!widget(id)) {
    return;
  }
  assert(`${id} runtime adapter`, binding?.adapter === "topic", `expected topic adapter, got ${binding?.adapter}`);
  assert(`${id} runtime target`, binding?.target === topic, `expected ${topic}, got ${binding?.target}`);
  assert(
    `${id} runtime message type`,
    binding?.value_mapping?.message_type === messageType,
    `expected ${messageType}, got ${binding?.value_mapping?.message_type}`,
  );
}

/**
 * The shaping mode, as cartesian_manager names it.
 *
 * These were B1/B2 toggles publishing the old extender_msgs TeleopCommand enum (0 and 3) on
 * /cmd/mode, which nothing in the ISIR stack has subscribed to since sandbox_controller was
 * replaced. The manager takes a string on /mode_request instead.
 */
function requireGeometricToggle(id) {
  if (!requireTopicWidget(id, "toggle", STACK.mode, "std_msgs/msg/String")) {
    return;
  }
  assert(`${id} starts off`, setting(id, "initialValue") === false, "initialValue must stay false");
  assert(
    `${id} returns to geometric/both`,
    String(setting(id, "offPayload")).includes("geometric/both"),
    "off must request geometric/both",
  );
  assert(
    `${id} requests a shaper`,
    /geometric\/(jaco|snake)/.test(String(setting(id, "onPayload"))),
    "on must request geometric/jaco or geometric/snake",
  );
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
  requireTopicWidget(id, "slider", STACK.maxLinearSpeed, "std_msgs/msg/Float64");
  requireTopicBinding(id, STACK.maxLinearSpeed, "std_msgs/msg/Float64");
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
  requireTopicWidget(id, "toggle", STACK.gripper, "std_msgs/msg/Float64MultiArray");
}

for (const id of ["sandbox-mode", "control-panel-mode", "snake-mode-toggle"]) {
  requireGeometricToggle(id);
}

if (requireTopicWidget("snake-hold", "command-button", STACK.mode)) {
  assert(
    "snake hold press payload",
    setting("snake-hold", "payload")?.data === "geometric/snake",
    "press must request geometric/snake",
  );
  assert(
    "snake hold release payload",
    setting("snake-hold", "releasedPayload")?.data === "geometric/both",
    "release must return to geometric/both",
  );
}

requireTopicWidget("control-panel-camera", "camera", "/camera/play_petanque");
requireTopicWidget("servo-camera", "camera", "/image_raw");
requireTopicWidget("control-panel-servo-enable", "toggle", STACK.servoOn, "std_msgs/msg/Bool");
requireTopicWidget("servo-enable", "toggle", STACK.servoOn, "std_msgs/msg/Bool");
requireTopicWidget("control-panel-servo-save", "command-button", STACK.servoSave, "std_msgs/msg/String");
requireTopicWidget("servo-save", "command-button", STACK.servoSave, "std_msgs/msg/String");

for (const [id, targetScreenId] of [
  ["servo-open-monitor", "visual_servoing_monitor"],
  ["servo-monitor-back", "visual_servoing"],
]) {
  if (requireWidget(id, "command-button")) {
    assert(`${id} navigation target`, setting(id, "targetScreenId") === targetScreenId, `expected ${targetScreenId}`);
  }
}

requireTopicWidget(
  "servo-topic-monitor-1",
  "topic-echo",
  STACK.tagDetections,
  "extender_msgs/msg/SharedControlGoalArray",
);

requireWidget("servo-output-plot", "plot-board");
const servoSeries = (setting("servo-output-plot", "series") ?? []).map(
  (entry) => `${entry.topic}:${entry.message_type}:${entry.field_path}`,
);
for (const topic of [STACK.servoVelocity, STACK.servoError]) {
  for (const axis of ["x", "y", "z"]) {
    const expected = `${topic}:geometry_msgs/msg/TwistStamped:twist.linear.${axis}`;
    assert(`servo output plots ${topic} ${axis}`, servoSeries.includes(expected), `missing ${expected}`);
  }
}

for (const topic of [STACK.gripper, STACK.maxLinearSpeed, STACK.mode, STACK.servoOn, STACK.servoSave]) {
  requirePolicyAllows(topic);
}
requirePolicyAllows(STACK.twist, "teleop");

// Nothing in the ISIR stack subscribes to the sandbox_controller family any more.
for (const topic of app?.runtime_policy?.allowed_publish_topics ?? []) {
  assert(
    `policy has retired ${topic}`,
    !topic.startsWith("/cmd/") && !topic.startsWith("/teleop_config/") && !topic.startsWith("/sandbox/"),
    "belongs to the previous architecture",
  );
}

// tools/hub documents /hub/digital_output as [pin, state, ...]; pin 13 is the board's own LED.
requireTopicWidget("sandbox-hub-output", "toggle", STACK.hubOutput, "std_msgs/msg/Float32MultiArray");
assert(
  "hub output on payload",
  /\[\s*13\s*,\s*1\s*\]/.test(String(setting("sandbox-hub-output", "onPayload"))),
  "expected [13, 1]",
);
requirePolicyAllows(STACK.hubOutput);
// hub.py publishes each Arduino line as [pin, value]; Snake Control shows both input topics raw.
requireTopicWidget("snake-hub-digital-input", "topic-echo", STACK.hubDigitalInput, "std_msgs/msg/Float32MultiArray");
requireTopicWidget("snake-hub-analog-input", "topic-echo", STACK.hubAnalogInput, "std_msgs/msg/Float32MultiArray");

finish();
