#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";

const configurationPairs = [
  {
    id: "sandbox",
    fixture: "tests/fixtures/sandbox-v0-configuration-bundle.json",
    seeded: "backend/data/configurations/sandbox.json",
  },
  {
    id: "bloom-debug",
    fixture: "tests/fixtures/bloom-debug-configuration.json",
    seeded: "backend/data/configurations/bloom-debug.json",
  },
  {
    id: "petanque-admin",
    fixture: "tests/fixtures/petanque-admin-configuration-bundle.json",
    seeded: "backend/data/configurations/petanque-admin.json",
  },
  {
    id: "explorer-user-tests",
    fixture: "tests/fixtures/explorer-user-tests-configuration-bundle.json",
    seeded: "backend/data/configurations/explorer-user-tests.json",
  },
  {
    id: "webcam-visualizer",
    fixture: "tests/fixtures/webcam-visualizer-configuration-bundle.json",
    seeded: "backend/data/configurations/webcam-visualizer.json",
  },
];

const backendSettings = readFileSync(resolve("backend/apps/bloom_api/settings.py"), "utf8");
const requireSeededConfigs = process.env.BLOOM_REQUIRE_SEEDED_CONFIGS === "1";
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

function isPublishingWidget(widget) {
  if (widget.kind === "command-button" && getString(getSetting(widget, "targetScreenId"))) {
    return false;
  }
  return ["command-button", "gesture-pad", "slider", "toggle"].includes(widget.kind);
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

  if (!existsSync(resolve(pair.seeded))) {
    assert(
      `${pair.id} seeded config is optional in clean checkouts`,
      !requireSeededConfigs,
      `${pair.seeded} is missing; run npm run validation:extender or refresh local configs`,
    );
    continue;
  }

  const seeded = readJson(pair.seeded);
  assert(
    `${pair.id} seeded config matches fixture`,
    isDeepStrictEqual(fixture, seeded),
    `${pair.seeded} must be refreshed from ${pair.fixture}`,
  );
}

for (const { pair, bundle } of fixtureBundles) {
  for (const app of bundle.applications ?? []) {
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
