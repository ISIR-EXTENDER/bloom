// The pipeline wiring check against the real tree: its enumerators find what the code declares, and a wire
// cut on purpose is reported as a gap where the untouched tree reports none.
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  createSources,
  enumerateCommandPurposes,
  enumerateModeStrings,
  enumerateSettingsControls,
  enumerateSliderPurposes,
  enumerateTogglePurposes,
  enumerateWidgetKinds,
  loadSeeds,
  parseParamsYaml,
  readBackendPolicy,
  readPayloadData,
  runPipelineWiringCheck,
} from "../pipeline-wiring-check.mjs";

const ROOT = resolve(".");
const REGISTRY = "frontend/libs/widget-renderers/src/default-registry.ts";
const src = createSources(ROOT);

test("the enumerators read the catalog, the purposes and the seeds", () => {
  const kinds = enumerateWidgetKinds(src).map((definition) => definition.kind);
  assert.ok(kinds.includes("robot-3d"), `kinds: ${kinds.join(",")}`);
  assert.ok(kinds.includes("command-button"));
  assert.ok(
    enumerateWidgetKinds(src)
      .find((d) => d.kind === "robot-3d")
      .requirements.includes("data-source"),
  );

  const purposes = enumerateCommandPurposes(src);
  assert.equal(purposes.find((p) => p.id === "go-home")?.mode, "behaviour/joint_target/home");
  assert.equal(purposes.find((p) => p.id === "frame-hybrid")?.frameId, "hybrid_frame");
  const navigate = purposes.find((p) => p.id === "navigate");
  assert.ok(navigate && navigate.mode === null && navigate.frameId === null, "navigate opens a screen");

  assert.equal(enumerateTogglePurposes(src).find((p) => p.id === "shared-control")?.mode, "behaviour/shared_control");
  assert.equal(
    enumerateSliderPurposes(src).find((p) => p.id === "snake-gain")?.parameter,
    "/cartesian_manager:shapers.snake.gain",
  );
  assert.equal(enumerateSliderPurposes(src).find((p) => p.id === "height")?.axis, "linear_z");
  assert.ok(enumerateSettingsControls(src).includes("deadzone"));

  const seeds = loadSeeds(src);
  const manager = seeds.find((seed) => seed.id === "explorer-manager");
  assert.ok(manager.modes.has("behaviour/joint_target/home"), [...manager.modes].join(","));
  assert.ok(manager.refs.some((ref) => ref.role === "teleop" && ref.topic === "/joystick_cartesian_command"));
  assert.ok(
    manager.refs.some((ref) => ref.role === "parameter" && ref.topic === "/cartesian_manager:shapers.snake.gain"),
  );

  const modes = enumerateModeStrings(src, seeds);
  assert.ok(modes.has("behaviour/shared_control"));
  assert.ok(modes.has("geometric/snake"));
  // A state-key prefix is not a request.
  assert.ok(!modes.has("behaviour/pose_target"));

  const policy = readBackendPolicy(src);
  assert.ok(policy.publishTopics.includes("/mode_request"));
  assert.ok(policy.parameterBounds.includes("/cartesian_manager:rate_limiter.max_linear_acceleration"));
  assert.ok(policy.grammar.behaviours.get("joint_target"), "joint_target takes a name");
  assert.equal(policy.grammar.behaviours.get("shared_control"), false, "shared_control's segment is optional");
});

test("payload text and params yaml are read the way the backend and the manager read them", () => {
  assert.equal(readPayloadData("{data: 'geometric/both'}"), "geometric/both");
  assert.equal(readPayloadData({ data: "behaviour/passthrough" }), "behaviour/passthrough");
  // Unquoted text is kept as the frontend reader keeps it; the mode pattern is what filters it out.
  assert.equal(readPayloadData("{data: [1.1]}"), "[1.1]");
  const doc = parseParamsYaml("a:\n  ros__parameters:\n    topics:\n      x: /x\n    names: [home, ready]\n");
  assert.deepEqual(doc.a.ros__parameters.topics, { x: "/x" });
  assert.deepEqual(doc.a.ros__parameters.names, ["home", "ready"]);
});

test("a cut wire is a gap, and the untouched tree has no such gap", () => {
  const registry = src.read(REGISTRY);
  const cut = registry.replace(/\n\s+\{ kind: "robot-3d", render: \w+ \},/, "");
  assert.notEqual(cut, registry, "the registry line to cut was found");
  const rendererGap = (result) => result.rows.find((row) => row.item === "kind:robot-3d" && row.link === "renderer");

  const untouched = runPipelineWiringCheck({ root: ROOT, managerConfigDir: "/nonexistent" });
  assert.equal(rendererGap(untouched).status, "ok");
  assert.equal(untouched.warnings.length, 1, "one warning when the manager configs are missing");
  assert.ok(
    untouched.rows.some((row) => row.status === "skipped"),
    "manager rows are skipped, not failed",
  );

  const broken = runPipelineWiringCheck({
    root: ROOT,
    managerConfigDir: "/nonexistent",
    overrides: { [REGISTRY]: cut },
  });
  assert.equal(rendererGap(broken).status, "gap");
  assert.ok(broken.gaps.length === untouched.gaps.length + 1, "exactly one new gap");
});
