#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const configurationPairs = [
  {
    id: "sandbox",
    fixture: "backend/seed/applications/sandbox.json",
  },
  {
    id: "bloom-debug",
    fixture: "backend/seed/applications/bloom-debug.json",
  },
  {
    id: "petanque-admin",
    fixture: "backend/seed/applications/petanque-admin.json",
  },
  {
    id: "explorer-user-tests",
    fixture: "backend/seed/applications/explorer-user-tests.json",
  },
  {
    id: "explorer-manager",
    fixture: "backend/seed/applications/explorer-manager.json",
  },
  {
    // Test-only fixtures: not shipped to anyone, but their runtime policy is
    // still gated so they cannot drift from the backend unnoticed.
    id: "shared-contract",
    fixture: "tests/fixtures/configuration-bundle.json",
  },
  {
    id: "compact-sandbox",
    fixture: "tests/fixtures/compact-sandbox-configuration.json",
  },
  {
    id: "sandbox-teleop-lab",
    fixture: "tests/fixtures/sandbox-teleop-lab-configuration.json",
  },
  {
    id: "webcam-visualizer",
    fixture: "backend/seed/applications/webcam-visualizer.json",
  },
];

const backendSettings = readFileSync(resolve("backend/apps/bloom_api/settings.py"), "utf8");
const backendPolicy = {
  allowed_message_types: readSettingsTuple("allowed_ros_message_types"),
  allowed_publish_topics: readSettingsTuple("allowed_ros_publish_topics"),
  allowed_recording_topics: readSettingsTuple("allowed_recording_topics"),
  allowed_teleop_targets: readSettingsTuple("allowed_teleop_targets"),
};

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

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

function readSettingsTuple(fieldName) {
  const pattern = new RegExp(`${fieldName}: tuple\\[str, \\.\\.\\.\\] = \\(([\\s\\S]*?)\\n    \\)`);
  const match = backendSettings.match(pattern);
  if (!match) {
    throw new Error(`Could not read ${fieldName} from backend settings.py`);
  }
  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
}

function widgets(app) {
  return (app.screens ?? []).flatMap((screen) =>
    (screen.widgets ?? []).map((widget) => ({
      app,
      screen,
      widget,
    })),
  );
}

function getSetting(widget, key) {
  return widget.settings?.[key];
}

function getRuntimeBinding(widget) {
  const binding = getSetting(widget, "runtime_binding");
  return isRecord(binding) ? binding : {};
}

function getValueMapping(widget) {
  const mapping = getRuntimeBinding(widget).value_mapping;
  return isRecord(mapping) ? mapping : {};
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function getPublishTopic(widget) {
  return getString(getSetting(widget, "topic")) ?? getString(getRuntimeBinding(widget).target);
}

function getPublishMessageType(widget) {
  return (
    getString(getSetting(widget, "messageType")) ??
    getString(getValueMapping(widget).message_type) ??
    getString(getValueMapping(widget).messageType) ??
    (widget.kind === "slider" ? "std_msgs/msg/Float64" : null)
  );
}

function isTeleopWidget(widget) {
  return getString(getRuntimeBinding(widget).adapter) === "teleop";
}

function isPublishingWidget(widget) {
  if (widget.kind === "command-button" && getString(getSetting(widget, "targetScreenId"))) {
    return false;
  }
  // A teleop-adapter widget contributes to a composed twist and is published
  // through the teleop path, so its target is a teleop target rather than a
  // publish topic. Sliders can be teleop widgets now that a full 6-DoF twist is
  // composed from several controls.
  if (isTeleopWidget(widget)) {
    return false;
  }
  return ["command-button", "gesture-pad", "slider", "toggle"].includes(widget.kind);
}

function getTeleopTarget(widget) {
  return getString(getValueMapping(widget).target_topic);
}

function assertPolicyIncludes(policy, key, value, label) {
  const values = policy?.[key] ?? [];
  assert(label, values.includes(value), `${value} missing from app ${key}`);
}

function assertBackendIncludes(key, value, label) {
  const values = backendPolicy[key] ?? [];
  assert(label, values.includes(value), `${value} missing from backend ${key}`);
}

const fixtureBundles = [];

for (const pair of configurationPairs) {
  const fixture = readJson(pair.fixture);
  fixtureBundles.push({ pair, bundle: fixture });

  // Comparing against a machine's own store belongs in a command that can read
  // it. The store is SQLite now, and this is a static JSON check, so
  // `bloom config status` answers "what have I not published yet" instead.
}

for (const { pair, bundle } of fixtureBundles) {
  for (const app of bundle.applications ?? []) {
    // An archived app is kept and runnable but not maintained against the
    // current architecture. Its policy still has to be internally coherent,
    // which is what the assertions below check, so it is not skipped: the point
    // of archiving is that it keeps working, not that it stops being checked.
    if (app.lifecycle === "archived") {
      console.log(`note: ${pair.id}/${app.id} is archived; checked against its own declared policy`);
    }
    const appPolicy = app.runtime_policy ?? {};

    for (const target of appPolicy.allowed_teleop_targets ?? []) {
      assertBackendIncludes(
        "allowed_teleop_targets",
        target,
        `${pair.id}/${app.id} backend allows teleop target ${target}`,
      );
    }

    for (const topic of appPolicy.allowed_recording_topics ?? []) {
      assertBackendIncludes("allowed_recording_topics", topic, `${pair.id}/${app.id} backend records ${topic}`);
    }

    for (const preset of app.action_presets ?? []) {
      if (preset.kind !== "topic-publish" || !preset.topic || !preset.message_type) {
        continue;
      }
      assertPolicyIncludes(
        appPolicy,
        "allowed_publish_topics",
        preset.topic,
        `${pair.id}/${app.id}/${preset.id} app policy allows preset topic`,
      );
      assertPolicyIncludes(
        appPolicy,
        "allowed_message_types",
        preset.message_type,
        `${pair.id}/${app.id}/${preset.id} app policy allows preset message type`,
      );
      assertBackendIncludes(
        "allowed_publish_topics",
        preset.topic,
        `${pair.id}/${app.id}/${preset.id} backend allows preset topic`,
      );
      assertBackendIncludes(
        "allowed_message_types",
        preset.message_type,
        `${pair.id}/${app.id}/${preset.id} backend allows preset message type`,
      );
    }

    for (const { screen, widget } of widgets(app)) {
      const binding = getRuntimeBinding(widget);
      const valueMapping = getValueMapping(widget);
      if (binding.adapter === "teleop") {
        const target = getString(valueMapping.target_topic);
        if (target) {
          assertPolicyIncludes(
            appPolicy,
            "allowed_teleop_targets",
            target,
            `${pair.id}/${app.id}/${screen.id}/${widget.id} app policy allows teleop target`,
          );
          assertBackendIncludes(
            "allowed_teleop_targets",
            target,
            `${pair.id}/${app.id}/${screen.id}/${widget.id} backend allows teleop target`,
          );
        }
      }

      if (isTeleopWidget(widget)) {
        // A teleop widget contributes to a composed twist. Its destination is a
        // teleop target, so validate it there rather than as a publish topic.
        const teleopTarget = getTeleopTarget(widget);
        if (teleopTarget) {
          assertPolicyIncludes(
            appPolicy,
            "allowed_teleop_targets",
            teleopTarget,
            `${pair.id}/${app.id}/${screen.id}/${widget.id} app policy allows teleop target`,
          );
          assertBackendIncludes(
            "allowed_teleop_targets",
            teleopTarget,
            `${pair.id}/${app.id}/${screen.id}/${widget.id} backend allows teleop target`,
          );
        }
        continue;
      }

      if (!isPublishingWidget(widget)) {
        continue;
      }

      const topic = getPublishTopic(widget);
      if (!topic) {
        continue;
      }

      const messageType = getPublishMessageType(widget);
      assertPolicyIncludes(
        appPolicy,
        "allowed_publish_topics",
        topic,
        `${pair.id}/${app.id}/${screen.id}/${widget.id} app policy allows publish topic`,
      );
      assertBackendIncludes(
        "allowed_publish_topics",
        topic,
        `${pair.id}/${app.id}/${screen.id}/${widget.id} backend allows publish topic`,
      );

      if (messageType) {
        assertPolicyIncludes(
          appPolicy,
          "allowed_message_types",
          messageType,
          `${pair.id}/${app.id}/${screen.id}/${widget.id} app policy allows message type`,
        );
        assertBackendIncludes(
          "allowed_message_types",
          messageType,
          `${pair.id}/${app.id}/${screen.id}/${widget.id} backend allows message type`,
        );
      } else {
        fail(
          `${pair.id}/${app.id}/${screen.id}/${widget.id} publish message type`,
          "publishing widgets must declare or infer a ROS message type",
        );
      }
    }
  }
}

if (failures.length > 0) {
  console.error("Frontend/backend coherence check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

for (const label of passed) {
  console.log(`ok: ${label}`);
}
console.log("Frontend/backend coherence check passed");
