/**
 * One app out of a seed bundle, the assertions every contract makes about its widgets and policy,
 * and the exit that prints them: `ok: <label>` per pass, or the failures and exit 1.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { STACK } from "./stack-topics.mjs";

export function openContract({ name, appId, defaultPath, argv = process.argv }) {
  const bundlePath = resolve(argv[2] ?? defaultPath);
  const bundle = JSON.parse(readFileSync(bundlePath, "utf8"));
  const app = bundle.applications?.find((candidate) => candidate.id === appId) ?? null;
  const failures = [];
  const passed = [];

  function assert(label, condition, detail = "expected condition to be true") {
    (condition ? passed : failures).push(condition ? label : `${label}: ${detail}`);
    return Boolean(condition);
  }

  const screens = () => app?.screens ?? [];
  const screen = (id) => screens().find((candidate) => candidate.id === id) ?? null;
  const widgets = () => screens().flatMap((screen) => (screen.widgets ?? []).map((widget) => ({ screen, widget })));
  const widget = (id) => widgets().find((entry) => entry.widget.id === id)?.widget ?? null;
  const setting = (id, key) => widget(id)?.settings?.[key];

  function requireWidget(id, kind) {
    const found = widget(id);
    assert(`widget ${id} exists`, Boolean(found), "missing widget");
    if (!found) {
      return null;
    }
    assert(`widget ${id} kind`, found.kind === kind, `expected ${kind}, got ${found.kind}`);
    return found;
  }

  /** A widget naming a topic in its own settings; the message type is checked when given. */
  function requireTopicWidget(id, kind, topic, messageType) {
    const found = requireWidget(id, kind);
    if (!found) {
      return null;
    }
    assert(`${id} topic`, setting(id, "topic") === topic, `expected ${topic}, got ${setting(id, "topic")}`);
    if (messageType !== undefined) {
      assert(
        `${id} message type`,
        setting(id, "messageType") === messageType,
        `expected ${messageType}, got ${setting(id, "messageType")}`,
      );
    }
    return found;
  }

  function requireTeleopTarget(id, binding) {
    assert(`${id} teleop adapter`, binding?.adapter === "teleop", `expected teleop adapter, got ${binding?.adapter}`);
    assert(
      `${id} teleop target`,
      binding?.value_mapping?.target_topic === STACK.twist,
      `expected ${STACK.twist}, got ${binding?.value_mapping?.target_topic}`,
    );
  }

  /** A joystick contributing a whole twist to the manager input, in one shaping mode. */
  function requireTeleopJoystick(id, mode) {
    const found = requireWidget(id, "joystick");
    if (!found) {
      return null;
    }
    const binding = found.settings?.runtime_binding;
    requireTeleopTarget(id, binding);
    assert(`${id} teleop mode`, binding?.value_mapping?.mode === mode, `expected mode ${mode}`);
    return found;
  }

  /** A slider contributing one axis to the composed twist instead of publishing a scalar. */
  function requireTeleopAxis(id, component) {
    const found = requireWidget(id, "slider");
    if (!found) {
      return null;
    }
    const binding = found.settings?.runtime_binding;
    requireTeleopTarget(id, binding);
    assert(
      `${id} drives ${component}`,
      binding?.axis_mapping?.value?.component === component,
      `expected ${component}, got ${binding?.axis_mapping?.value?.component}`,
    );
    return found;
  }

  function requirePolicyAllows(topic, kind = "publish") {
    const key = {
      publish: "allowed_publish_topics",
      recording: "allowed_recording_topics",
      teleop: "allowed_teleop_targets",
    }[kind];
    const values = app?.runtime_policy?.[key] ?? [];
    assert(`runtime policy allows ${topic}`, values.includes(topic), `${key} does not include ${topic}`);
  }

  function finish() {
    if (failures.length > 0) {
      console.error(`${name} failed:`);
      for (const failure of failures) {
        console.error(`- ${failure}`);
      }
      process.exit(1);
    }
    for (const label of passed) {
      console.log(`ok: ${label}`);
    }
    console.log(`${name} passed for ${bundlePath}`);
  }

  return {
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
    screens,
    setting,
    widget,
    widgets,
  };
}
