#!/usr/bin/env node
/**
 * Petanque runtime contract.
 *
 * Petanque admin is the legacy Petanque workflow rebased onto the current
 * architecture: teleop composes a TwistStamped on /joystick_cartesian_command
 * for cartesian_manager, match flow speaks apps-petanque's state machine on
 * /petanque_state_machine/change_state, and the measure results arrive on the
 * tablet bridge's compressed-image topics. This check asserts that wiring, and
 * that nothing from the previous architecture survives in the policy.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { openContract } from "./lib/seed-contract.mjs";
import { STACK } from "./lib/stack-topics.mjs";

const {
  app,
  assert,
  bundle,
  finish,
  requirePolicyAllows,
  requireTeleopAxis,
  requireTeleopJoystick,
  requireTopicWidget,
  requireWidget,
  screen,
  setting,
  widget,
} = openContract({
  name: "Petanque runtime contract",
  appId: "app-petanque-admin",
  defaultPath: "backend/seed/applications/petanque-admin.json",
});
const backendSettings = readFileSync(resolve("backend/apps/bloom_api/settings.py"), "utf8");

function requireScreen(id, title) {
  const found = screen(id);
  assert(`screen ${id} exists`, Boolean(found), "missing screen");
  if (!found) return;
  assert(`screen ${id} title`, found.title === title, `expected ${title}, got ${found.title}`);
  assert(`screen ${id} has widgets`, (found.widgets ?? []).length > 0, "screen must not be empty");
}

function requireTeleopSlider(id, target, component) {
  if (!requireTeleopAxis(id, component)) return;
  const binding = setting(id, "runtime_binding");
  assert(`${id} teleop target label`, binding?.target === target, `expected ${target}, got ${binding?.target}`);
  assert(`${id} returns to center`, setting(id, "returnToCenter") === true, "expected return-to-center");
}

function requireStateButton(id, command, confirmed) {
  const found = requireTopicWidget(id, "command-button", STACK.petanqueState, "std_msgs/msg/String");
  assert(`${id} payload`, setting(id, "payload")?.data === command, `expected ${command}`);
  assert(
    `${id} ${confirmed ? "confirms" : "does not confirm"}`,
    Boolean(setting(id, "confirm_press")) === confirmed,
    "confirm_press mismatch",
  );
  return found;
}

function requireRosCamera(id, topic) {
  requireTopicWidget(id, "camera", topic);
  assert(`${id} source`, setting(id, "source") === "ros-topic", `expected ros-topic, got ${setting(id, "source")}`);
}

function requireBackendDefault(value, label) {
  assert(
    `backend default allows ${label}`,
    backendSettings.includes(`"${value}"`),
    `${value} missing from settings.py`,
  );
}

function actionPreset(id) {
  return app?.action_presets?.find((candidate) => candidate.id === id) ?? null;
}

assert("bundle schema version", bundle.metadata?.schema_version === 1, "expected schema version 1");
assert("Petanque admin app exists", Boolean(app), "missing app-petanque-admin");
assert("Petanque admin name", app?.name === "Petanque admin", `expected Petanque admin, got ${app?.name}`);
assert("Petanque admin is active", app?.lifecycle === "active", `got ${app?.lifecycle}`);
assert("Petanque admin screen count", (app?.screens ?? []).length === 11, "expected 11 screens");

for (const [id, title] of [
  ["default_control", "Teleop controls"],
  ["default_live_teleop", "Live teleop"],
  ["articular", "Joint controls"],
  ["camera", "Camera supervision"],
  ["visual_servoing", "Visual servoing"],
  ["logs", "Logs"],
  ["poses", "Saved poses"],
  ["default_petanque", "Petanque match"],
  ["petanque_teleop_config", "Teleop settings"],
  ["curves", "Telemetry curves"],
  ["debug", "Debug"],
]) {
  requireScreen(id, title);
}
assert("the configurations screen is gone", screen("configurations") === null, "its one control had no consumer");

// Teleop feeds cartesian_manager's summed input, never a raw robot topic.
for (const [id, mode] of [
  ["control-translation", 3],
  ["live-joystick", 3],
  ["control-rotation", 1],
  ["live-rotation", 1],
]) {
  if (requireTeleopJoystick(id, mode)) {
    assert(`${id} zero on release`, setting(id, "zero_on_release") === true, "expected release-to-zero behavior");
  }
}
requireTeleopSlider("control-z", "translation", "linear_z");
requireTeleopSlider("control-rz", "rotation", "angular_z");
requirePolicyAllows(STACK.twist, "teleop");
requireBackendDefault(STACK.twist, "teleop target");

// Speed is qontrol's own runtime limit topic, as in the Manager apps.
for (const id of ["control-max-velocity", "teleop-config-max-velocity"]) {
  requireTopicWidget(id, "slider", STACK.maxLinearSpeed, "std_msgs/msg/Float64");
}

// The gripper speaks the position controller with the Explorer's travel.
requireTopicWidget("control-gripper", "toggle", STACK.gripper, "std_msgs/msg/Float64MultiArray");
// On is closed, as gripperToggleSettings("explorer") and the Manager apps have it.
assert("control-gripper closed payload", setting("control-gripper", "onPayload") === "{data: [1.1]}");
assert("control-gripper open payload", setting("control-gripper", "offPayload") === "{data: [0.2]}");

// Home is the manager's own joint-target behaviour, dispatched with a confirm.
for (const id of ["control-load-home-pose", "poses-load-home"]) {
  requireTopicWidget(id, "command-button", STACK.mode, "std_msgs/msg/String");
  assert(`${id} payload`, setting(id, "payload")?.data === "behaviour/joint_target/home", "expected home behaviour");
  assert(`${id} confirms`, setting(id, "confirm_press") === true, "a motion request needs a confirm");
}
requireWidget("poses-library", "position-library");
assert(
  `poses-library reads ${STACK.jointStates}`,
  setting("poses-library", "jointStateTopic") === STACK.jointStates,
  `expected ${STACK.jointStates}`,
);

// Match flow speaks apps-petanque's state machine, motion states confirmed.
requireStateButton("petanque-start", "go_to_start", true);
requireStateButton("petanque-activate-throw", "activate_throw", true);
requireStateButton("petanque-throw", "throw", true);
requireStateButton("petanque-pick-up", "pick_up", true);
requireStateButton("petanque-stop", "stop", false);
requireTopicWidget("petanque-state", "topic-echo", STACK.petanqueState, "std_msgs/msg/String");
requireTopicWidget("teleop-config-mode", "toggle", STACK.petanqueState, "std_msgs/msg/String");
assert("teleop-config-mode enters teleop", setting("teleop-config-mode", "onPayload") === "{data: 'teleop'}");
assert("teleop-config-mode leaves to idle", setting("teleop-config-mode", "offPayload") === "{data: 'stop'}");

// Visual servoing is the live input_interfaces node, same wiring as Sandbox.
requireTopicWidget("visual-servoing-toggle", "toggle", STACK.servoOn, "std_msgs/msg/Bool");
requireTopicWidget("visual-servoing-save", "command-button", STACK.servoSave, "std_msgs/msg/String");
requireTopicWidget("visual-servoing-error", "topic-plot", STACK.servoError, "geometry_msgs/msg/TwistStamped");

// Cameras are real ROS streams through the backend camera path.
requireRosCamera("live-camera", STACK.cameraImage);
requireRosCamera("camera-main-stream", STACK.cameraImage);
requireRosCamera("camera-result-stream", STACK.petanqueResultImage);
requireRosCamera("visual-servoing-camera", STACK.cameraImage);
requireRosCamera("petanque-camera", STACK.cameraImage);
assert("the rviz stream is gone", widget("live-rviz") === null, "webrtc rviz had no source");

// Telemetry reads what qontrol actually publishes.
for (const [id, fieldPath] of [
  ["curves-velocity-x", "twist.linear.x"],
  ["curves-velocity-z", "twist.linear.z"],
]) {
  requireTopicWidget(id, "topic-plot", STACK.eeVelocity, "geometry_msgs/msg/TwistStamped");
  assert(`${id} field path`, setting(id, "fieldPath") === fieldPath, `expected ${fieldPath}`);
}
requireTopicWidget("debug-teleop", "topic-echo", STACK.twist, "geometry_msgs/msg/TwistStamped");
requireTopicWidget("articular-joint-plot", "topic-plot", STACK.jointStates, "sensor_msgs/msg/JointState");
requireTopicWidget("logs-rosout", "topic-echo", STACK.rosout, "rcl_interfaces/msg/Log");
requireTopicWidget("logs-events", "topic-echo", STACK.petanqueState, "std_msgs/msg/String");

for (const topic of [
  STACK.maxLinearSpeed,
  STACK.gripper,
  STACK.mode,
  STACK.petanqueState,
  STACK.servoOn,
  STACK.servoSave,
]) {
  requirePolicyAllows(topic);
  requireBackendDefault(topic, topic);
}
for (const topic of [STACK.jointStates, STACK.petanqueState, STACK.eeVelocity, STACK.rosout]) {
  requirePolicyAllows(topic, "recording");
}

// Nothing from the previous architecture survives in the policy.
for (const topic of [
  ...(app?.runtime_policy?.allowed_publish_topics ?? []),
  ...(app?.runtime_policy?.allowed_teleop_targets ?? []),
]) {
  assert(
    `policy has retired ${topic}`,
    !topic.startsWith("/cmd/") &&
      !topic.startsWith("/ui/load_pose") &&
      !topic.startsWith("/ui/save_pose") &&
      !topic.startsWith("/ui/navigation") &&
      !topic.startsWith("/petanque/throw/") &&
      !topic.startsWith("/petanque/teleop/") &&
      topic !== "/teleop_cmd" &&
      topic !== "/visual_servoing/enabled",
    "belongs to the previous architecture",
  );
}

const activateThrowPreset = actionPreset("petanque-activate-throw");
assert("activate throw preset exists", Boolean(activateThrowPreset), "missing action preset");
assert("activate throw preset topic", activateThrowPreset?.topic === STACK.petanqueState);

const gripperPreset = actionPreset("petanque-gripper-open");
assert("gripper open preset exists", Boolean(gripperPreset), "missing action preset");
assert("gripper open preset topic", gripperPreset?.topic === STACK.gripper);
assert("gripper open preset payload", gripperPreset?.payload?.data?.[0] === 0.2, "expected the Explorer open travel");

finish();
