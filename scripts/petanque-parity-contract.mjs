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
 *
 * The throw parameters (/petanque_throw/set_parameters) are a ROS parameter
 * service, which Bloom cannot reach until it has a parameter seam; the app
 * deliberately offers no throw tuning rather than publishing into silence.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const fixturePath = resolve(process.argv[2] ?? "backend/seed/applications/petanque-admin.json");
const backendSettingsPath = resolve("backend/apps/bloom_api/settings.py");
const bundle = JSON.parse(readFileSync(fixturePath, "utf8"));
const backendSettings = readFileSync(backendSettingsPath, "utf8");
const app = bundle.applications?.find((candidate) => candidate.id === "app-petanque-admin");

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

function screen(id) {
  return app?.screens?.find((candidate) => candidate.id === id) ?? null;
}

function widget(id) {
  return widgets().find((entry) => entry.widget.id === id)?.widget ?? null;
}

function setting(id, key) {
  return widget(id)?.settings?.[key];
}

function requireScreen(id, title) {
  const found = screen(id);
  assert(`screen ${id} exists`, Boolean(found), "missing screen");
  if (!found) return;
  assert(`screen ${id} title`, found.title === title, `expected ${title}, got ${found.title}`);
  assert(`screen ${id} has widgets`, (found.widgets ?? []).length > 0, "screen must not be empty");
}

function requireWidget(id, kind) {
  const found = widget(id);
  assert(`widget ${id} exists`, Boolean(found), "missing widget");
  if (!found) return null;
  assert(`widget ${id} kind`, found.kind === kind, `expected ${kind}, got ${found.kind}`);
  return found;
}

function requireTopicWidget(id, kind, topic, messageType) {
  const found = requireWidget(id, kind);
  if (!found) return;
  assert(`${id} topic`, found.settings?.topic === topic, `expected ${topic}, got ${found.settings?.topic}`);
  if (messageType !== undefined) {
    assert(
      `${id} message type`,
      found.settings?.messageType === messageType,
      `expected ${messageType}, got ${found.settings?.messageType}`,
    );
  }
}

function requireTeleopJoystick(id, mode) {
  const found = requireWidget(id, "joystick");
  if (!found) return;
  const binding = found.settings?.runtime_binding;
  assert(`${id} teleop adapter`, binding?.adapter === "teleop", `expected teleop adapter, got ${binding?.adapter}`);
  assert(
    `${id} teleop target`,
    binding?.value_mapping?.target_topic === "/joystick_cartesian_command",
    `expected /joystick_cartesian_command, got ${binding?.value_mapping?.target_topic}`,
  );
  assert(`${id} teleop mode`, binding?.value_mapping?.mode === mode, `expected mode ${mode}`);
  assert(`${id} zero on release`, found.settings?.zero_on_release === true, "expected release-to-zero behavior");
}

function requireTeleopSlider(id, target, component) {
  const found = requireWidget(id, "slider");
  if (!found) return;
  const binding = found.settings?.runtime_binding;
  assert(`${id} teleop adapter`, binding?.adapter === "teleop", `expected teleop adapter, got ${binding?.adapter}`);
  assert(`${id} teleop target`, binding?.target === target, `expected ${target}, got ${binding?.target}`);
  assert(
    `${id} teleop component`,
    binding?.axis_mapping?.value?.component === component,
    `expected ${component}, got ${binding?.axis_mapping?.value?.component}`,
  );
  assert(
    `${id} teleop topic`,
    binding?.value_mapping?.target_topic === "/joystick_cartesian_command",
    `expected /joystick_cartesian_command, got ${binding?.value_mapping?.target_topic}`,
  );
  assert(`${id} returns to center`, found.settings?.returnToCenter === true, "expected return-to-center");
}

function requireStateButton(id, command, confirmed) {
  const found = requireTopicWidget(id, "command-button", "/petanque_state_machine/change_state", "std_msgs/msg/String");
  assert(`${id} payload`, setting(id, "payload")?.data === command, `expected ${command}`);
  assert(
    `${id} ${confirmed ? "confirms" : "does not confirm"}`,
    Boolean(setting(id, "confirm_press")) === confirmed,
    "confirm_press mismatch",
  );
  return found;
}

function requireRosCamera(id, topic) {
  requireWidget(id, "camera");
  assert(`${id} source`, setting(id, "source") === "ros-topic", `expected ros-topic, got ${setting(id, "source")}`);
  assert(`${id} topic`, setting(id, "topic") === topic, `expected ${topic}, got ${setting(id, "topic")}`);
}

function requirePolicyAllows(topic, kind = "publish") {
  const keys = {
    publish: "allowed_publish_topics",
    teleop: "allowed_teleop_targets",
    recording: "allowed_recording_topics",
  };
  const values = app?.runtime_policy?.[keys[kind]] ?? [];
  assert(`app policy allows ${topic}`, values.includes(topic), `${keys[kind]} does not include ${topic}`);
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
  requireTeleopJoystick(id, mode);
}
requireTeleopSlider("control-z", "translation", "linear_z");
requireTeleopSlider("control-rz", "rotation", "angular_z");
requirePolicyAllows("/joystick_cartesian_command", "teleop");
requireBackendDefault("/joystick_cartesian_command", "teleop target");

// Speed is qontrol's own runtime limit topic, as in the Manager apps.
for (const id of ["control-max-velocity", "teleop-config-max-velocity"]) {
  requireTopicWidget(id, "slider", "/explorer_user_interfaces/rqt_armcontrol/max_linear_speed", "std_msgs/msg/Float64");
}

// The gripper speaks the position controller with the Explorer's travel.
requireTopicWidget("control-gripper", "toggle", "/gripper_controller/commands", "std_msgs/msg/Float64MultiArray");
assert("control-gripper open payload", setting("control-gripper", "onPayload") === "{data: [0.2]}");
assert("control-gripper closed payload", setting("control-gripper", "offPayload") === "{data: [1.1]}");

// Home is the manager's own joint-target behaviour, dispatched with a confirm.
for (const id of ["control-load-home-pose", "poses-load-home"]) {
  requireTopicWidget(id, "command-button", "/mode_request", "std_msgs/msg/String");
  assert(`${id} payload`, setting(id, "payload")?.data === "behaviour/joint_target/home", "expected home behaviour");
  assert(`${id} confirms`, setting(id, "confirm_press") === true, "a motion request needs a confirm");
}
requireWidget("poses-library", "position-library");
assert(
  "poses-library reads /joint_states",
  setting("poses-library", "jointStateTopic") === "/joint_states",
  "expected /joint_states",
);

// Match flow speaks apps-petanque's state machine, motion states confirmed.
requireStateButton("petanque-start", "go_to_start", true);
requireStateButton("petanque-activate-throw", "activate_throw", true);
requireStateButton("petanque-throw", "throw", true);
requireStateButton("petanque-pick-up", "pick_up", true);
requireStateButton("petanque-stop", "stop", false);
requireTopicWidget("petanque-state", "topic-echo", "/petanque_state_machine/change_state", "std_msgs/msg/String");
requireTopicWidget("teleop-config-mode", "toggle", "/petanque_state_machine/change_state", "std_msgs/msg/String");
assert("teleop-config-mode enters teleop", setting("teleop-config-mode", "onPayload") === "{data: 'teleop'}");
assert("teleop-config-mode leaves to idle", setting("teleop-config-mode", "offPayload") === "{data: 'stop'}");

// Visual servoing is the live input_interfaces node, same wiring as Sandbox.
requireTopicWidget("visual-servoing-toggle", "toggle", "/ui/visual_servoing/on", "std_msgs/msg/Bool");
requireTopicWidget("visual-servoing-save", "command-button", "/ui/visual_servoing/save", "std_msgs/msg/String");
requireTopicWidget(
  "visual-servoing-error",
  "topic-plot",
  "/visual_servoing/error_TAGtoTAGd",
  "geometry_msgs/msg/TwistStamped",
);

// Cameras are real ROS streams through the backend camera path.
requireRosCamera("live-camera", "/camera/color/image_raw/compressed");
requireRosCamera("camera-main-stream", "/camera/color/image_raw/compressed");
requireRosCamera("camera-result-stream", "/petanque/measure/result_image/compressed");
requireRosCamera("visual-servoing-camera", "/camera/color/image_raw/compressed");
requireRosCamera("petanque-camera", "/camera/color/image_raw/compressed");
assert("the rviz stream is gone", widget("live-rviz") === null, "webrtc rviz had no source");

// Telemetry reads what qontrol actually publishes.
for (const [id, fieldPath] of [
  ["curves-velocity-x", "twist.linear.x"],
  ["curves-velocity-z", "twist.linear.z"],
]) {
  requireTopicWidget(id, "topic-plot", "/ee_velocity", "geometry_msgs/msg/TwistStamped");
  assert(`${id} field path`, setting(id, "fieldPath") === fieldPath, `expected ${fieldPath}`);
}
requireTopicWidget("debug-teleop", "topic-echo", "/joystick_cartesian_command", "geometry_msgs/msg/TwistStamped");
requireTopicWidget("articular-joint-plot", "topic-plot", "/joint_states", "sensor_msgs/msg/JointState");
requireTopicWidget("logs-rosout", "topic-echo", "/rosout", "rcl_interfaces/msg/Log");
requireTopicWidget("logs-events", "topic-echo", "/petanque_state_machine/change_state", "std_msgs/msg/String");

for (const topic of [
  "/explorer_user_interfaces/rqt_armcontrol/max_linear_speed",
  "/gripper_controller/commands",
  "/mode_request",
  "/petanque_state_machine/change_state",
  "/ui/visual_servoing/on",
  "/ui/visual_servoing/save",
]) {
  requirePolicyAllows(topic);
  requireBackendDefault(topic, topic);
}
for (const topic of ["/joint_states", "/petanque_state_machine/change_state", "/ee_velocity", "/rosout"]) {
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
assert("activate throw preset topic", activateThrowPreset?.topic === "/petanque_state_machine/change_state");

const gripperPreset = actionPreset("petanque-gripper-open");
assert("gripper open preset exists", Boolean(gripperPreset), "missing action preset");
assert("gripper open preset topic", gripperPreset?.topic === "/gripper_controller/commands");
assert("gripper open preset payload", gripperPreset?.payload?.data?.[0] === 0.2, "expected the Explorer open travel");

if (failures.length > 0) {
  console.error("Petanque runtime contract failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

for (const label of passed) {
  console.log(`ok: ${label}`);
}
console.log(`Petanque runtime contract passed for ${fixturePath}`);
