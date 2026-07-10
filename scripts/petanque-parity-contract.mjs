#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const fixturePath = resolve(process.argv[2] ?? "tests/fixtures/petanque-admin-configuration-bundle.json");
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

function requireTeleopJoystick(id, mode, legacyTopic) {
  const found = requireWidget(id, "joystick");
  if (!found) return;
  const binding = found.settings?.runtime_binding;
  assert(`${id} legacy topic metadata`, found.settings?.topic === legacyTopic, `expected ${legacyTopic}`);
  assert(`${id} teleop adapter`, binding?.adapter === "teleop", `expected teleop adapter, got ${binding?.adapter}`);
  assert(
    `${id} teleop target`,
    binding?.value_mapping?.target_topic === "/teleop_cmd",
    `expected /teleop_cmd, got ${binding?.value_mapping?.target_topic}`,
  );
  assert(`${id} teleop mode`, binding?.value_mapping?.mode === mode, `expected mode ${mode}`);
  assert(`${id} publish rate`, found.settings?.publish_rate_hz === 20, "expected 20 Hz legacy cadence");
  assert(`${id} zero on release`, found.settings?.zero_on_release === true, "expected release-to-zero behavior");
}

function requirePayload(id, expectedPayload) {
  assert(`${id} payload`, setting(id, "payload") === expectedPayload, `expected ${expectedPayload}`);
}

function requirePolicyAllows(topic, kind = "publish") {
  const key = kind === "teleop" ? "allowed_teleop_targets" : "allowed_publish_topics";
  const values = app?.runtime_policy?.[key] ?? [];
  assert(`app policy allows ${topic}`, values.includes(topic), `${key} does not include ${topic}`);
}

function requirePolicyMessage(messageType) {
  const values = app?.runtime_policy?.allowed_message_types ?? [];
  assert(`app policy allows ${messageType}`, values.includes(messageType), "message type is not allowlisted");
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
assert(
  "bundle source",
  bundle.metadata?.source === "legacy-application-screens:app-petanque-admin.json",
  `unexpected source ${bundle.metadata?.source}`,
);
assert("Petanque admin app exists", Boolean(app), "missing app-petanque-admin");
assert("Petanque admin name", app?.name === "Petanque admin", `expected Petanque admin, got ${app?.name}`);
assert("Petanque admin screen count", (app?.screens ?? []).length === 12, "expected 12 migrated screens");

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
  ["configurations", "Configuration"],
  ["debug", "Debug"],
]) {
  requireScreen(id, title);
}

for (const [id, mode, legacyTopic] of [
  ["control-translation", 3, "/cmd/joystick_xy"],
  ["live-joystick", 3, "/cmd/joystick_xy"],
  ["control-rotation", 1, "/cmd/joystick_rxry"],
  ["live-rotation", 1, "/cmd/joystick_rxry"],
]) {
  requireTeleopJoystick(id, mode, legacyTopic);
}
requirePolicyAllows("/teleop_cmd", "teleop");
requireBackendDefault("/teleop_cmd", "teleop target");

for (const [id, topic] of [
  ["control-rz", "/cmd/joystick_rz"],
  ["control-z", "/cmd/joystick_z"],
  ["control-max-velocity", "/cmd/max_velocity"],
  ["teleop-config-max-velocity", "/cmd/max_velocity"],
  ["teleop-config-throw-alpha", "/petanque/throw/alpha"],
]) {
  requireWidget(id, "slider");
  assert(`${id} topic`, setting(id, "topic") === topic, `expected ${topic}, got ${setting(id, "topic")}`);
  requirePolicyAllows(topic);
}

requireTopicWidget("control-gripper", "toggle", "/cmd/gripper", "std_msgs/msg/Bool");
assert("control-gripper closed payload", setting("control-gripper", "onPayload") === "{data: true}");
assert("control-gripper open payload", setting("control-gripper", "offPayload") === "{data: false}");
requireTopicWidget("teleop-config-mode", "toggle", "/petanque/teleop/enabled", "std_msgs/msg/Bool");
assert("teleop-config-mode starts in teleop", setting("teleop-config-mode", "initialValue") === true);
requireTopicWidget("visual-servoing-toggle", "toggle", "/visual_servoing/enabled", "std_msgs/msg/Bool");

for (const [id, topic, payload] of [
  ["control-load-home-pose", "/ui/load_pose", "{data: 'home'}"],
  ["poses-load-home", "/ui/load_pose", "{data: 'home'}"],
  ["poses-save-current", "/ui/save_pose", "{data: 'current'}"],
  ["petanque-start", "/cmd/petanque/round", "{data: 'start'}"],
  ["petanque-stop", "/cmd/petanque/round", "{data: 'stop'}"],
  ["configuration-request-image", "/petanque/measure/request_image", "{data: 'capture'}"],
]) {
  requireTopicWidget(id, "command-button", topic, "std_msgs/msg/String");
  requirePayload(id, payload);
  requirePolicyAllows(topic);
}

requireTopicWidget("teleop-config-throw-gesture", "gesture-pad", "/petanque/throw/gesture", "std_msgs/msg/String");
assert(
  "throw gesture command",
  setting("teleop-config-throw-gesture", "command") === "petanque.throw.preview",
  "expected generic gesture command id",
);
requirePolicyAllows("/petanque/throw/gesture");

for (const [id, source, streamUrl] of [
  ["live-camera", "camera", "webrtc://localhost:8001/stream"],
  ["live-rviz", "rviz", "webrtc://localhost:8001/rviz"],
  ["camera-main-stream", "stream-url", "webrtc://localhost:8001/stream"],
  ["camera-result-stream", "stream-url", "/petanque/measure/result_image/compressed"],
  ["visual-servoing-camera", "stream-url", "webrtc://localhost:8001/stream"],
  ["petanque-camera", "camera", "webrtc://localhost:8001/stream"],
]) {
  requireWidget(id, "camera");
  assert(`${id} source`, setting(id, "source") === source, `expected ${source}`);
  assert(`${id} stream`, setting(id, "streamUrl") === streamUrl, `expected ${streamUrl}`);
}

for (const [id, topic, messageType, fieldPath] of [
  ["articular-joint-plot", "/joint_states", "sensor_msgs/msg/JointState", "position.0"],
  ["articular-joint-echo", "/joint_states", "sensor_msgs/msg/JointState", ""],
  ["logs-rosout", "/rosout", "rcl_interfaces/msg/Log", ""],
  ["logs-events", "/petanque_state_machine/change_state", "std_msgs/msg/String", "data"],
  ["poses-joint-state", "/joint_states", "sensor_msgs/msg/JointState", ""],
  ["curves-velocity-x", "/sandbox_controller/velocity_command", "geometry_msgs/msg/Twist", "linear.x"],
  ["curves-velocity-z", "/sandbox_controller/velocity_command", "geometry_msgs/msg/Twist", "linear.z"],
  ["debug-teleop", "/teleop_cmd", "extender_msgs/msg/TeleopCommand", ""],
  ["debug-state-machine", "/petanque_state_machine/change_state", "std_msgs/msg/String", "data"],
]) {
  const kind = id.includes("plot") || id.includes("velocity") ? "topic-plot" : "topic-echo";
  requireTopicWidget(id, kind, topic, messageType);
  assert(`${id} field path`, setting(id, "fieldPath") === fieldPath, `expected ${fieldPath}`);
}

for (const topic of ["/joint_states", "/rosout", "/petanque_state_machine/change_state", "/teleop_cmd"]) {
  const values = app?.runtime_policy?.allowed_recording_topics ?? [];
  assert(`recording policy includes ${topic}`, values.includes(topic), "recording topic is not allowlisted");
}

for (const messageType of ["std_msgs/msg/Bool", "std_msgs/msg/Float64", "std_msgs/msg/String"]) {
  requirePolicyMessage(messageType);
  requireBackendDefault(messageType, messageType);
}

for (const topic of [
  "/cmd/gripper",
  "/cmd/joystick_rz",
  "/cmd/joystick_z",
  "/cmd/max_velocity",
  "/cmd/petanque/round",
  "/petanque/measure/request_image",
  "/petanque/teleop/enabled",
  "/petanque/throw/alpha",
  "/petanque/throw/gesture",
  "/petanque_state_machine/change_state",
  "/ui/load_pose",
  "/ui/save_pose",
  "/visual_servoing/enabled",
]) {
  requirePolicyAllows(topic);
  requireBackendDefault(topic, topic);
}

const activateThrowPreset = actionPreset("petanque-activate-throw");
assert("activate throw preset exists", Boolean(activateThrowPreset), "missing action preset");
assert("activate throw preset kind", activateThrowPreset?.kind === "topic-publish", "expected topic-publish");
assert("activate throw preset topic", activateThrowPreset?.topic === "/petanque_state_machine/change_state");
assert("activate throw preset payload", activateThrowPreset?.payload_text === "{data: 'activate_throw'}");

const gripperPreset = actionPreset("petanque-gripper-open");
assert("gripper open preset exists", Boolean(gripperPreset), "missing action preset");
assert("gripper open preset kind", gripperPreset?.kind === "topic-publish", "expected topic-publish");
assert("gripper open preset topic", gripperPreset?.topic === "/cmd/gripper");
assert("gripper open preset payload", gripperPreset?.payload?.data === true, "expected Bool true payload");

const policyTopics = new Set(app?.runtime_policy?.allowed_publish_topics ?? []);
for (const entry of widgets()) {
  if (!["command-button", "gesture-pad", "slider", "toggle"].includes(entry.widget.kind)) continue;
  const topic = entry.widget.settings?.topic;
  if (typeof topic === "string" && topic.length > 0) {
    assert(`${entry.widget.id} topic is app-allowlisted`, policyTopics.has(topic), `${topic} missing from app policy`);
  }
}

if (failures.length > 0) {
  console.error("Petanque legacy parity contract failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

for (const label of passed) {
  console.log(`ok: ${label}`);
}
console.log(`Petanque legacy parity contract passed for ${fixturePath}`);
