#!/usr/bin/env node
/**
 * Pipeline wiring check: every control Bloom offers, followed from the palette to the robot.
 *
 * Widget kinds, purposes, presets, Settings controls, mode strings and the topics the shipped seeds name are
 * read from the code and the seeds, never from a hand-written list. Each is then asserted link by link with a
 * file as evidence: renderer -> Builder settings -> runtime dispatch -> backend route and allowlists -> sim
 * harness or cartesian_manager config -> a sim check or test that names it. One row per link on stdout; exit 1
 * on any Bloom-side gap not on the small allowlist below. A finding on the manager or its config side is
 * reported as "external" and does not fail the check.
 *
 *   node scripts/pipeline-wiring-check.mjs   (the manager configs are read from ../extender_workspace when present)
 *   BLOOM_MANAGER_CONFIG_DIR=/path/to/cartesian_manager/bringup/config node scripts/pipeline-wiring-check.mjs
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The manager configs, when extender_workspace is checked out beside this repository. */
export const defaultManagerConfigDir = (root) =>
  resolve(root, "..", "extender_workspace", "src", "cartesian_manager", "bringup", "config");

const F = {
  catalog: "frontend/libs/widgets/src/widget-catalog.ts",
  kinds: "frontend/libs/api-client/src/types.ts",
  rendererRegistry: "frontend/libs/widget-renderers/src/default-registry.ts",
  rendererIndex: "frontend/libs/widget-renderers/src/index.tsx",
  settingsContracts: "frontend/libs/widgets/src/settings.ts",
  settingsValidation: "frontend/libs/widgets/src/settings/validation.ts",
  settingsField: "frontend/apps/bloom-dashboard/src/builder/BuilderSettingsField.tsx",
  settingsEditor: "frontend/apps/bloom-dashboard/src/builder/BuilderWidgetSettingsEditor.tsx",
  starters: "frontend/apps/bloom-dashboard/src/builder/builder-starters.ts",
  paletteWiring: "frontend/libs/widgets/src/palette-wiring.ts",
  commandPurposes: "frontend/libs/widgets/src/command-purposes.ts",
  presets: "frontend/libs/widgets/src/settings/presets.ts",
  sliderPurposes: "frontend/libs/widgets/src/slider-purposes.ts",
  togglePurposes: "frontend/libs/widgets/src/toggle-purposes.ts",
  joystickPurposes: "frontend/libs/widgets/src/robot-axes.ts",
  gripper: "frontend/libs/widgets/src/gripper.ts",
  intents: "frontend/libs/widgets/src/runtime.ts",
  modeGrammar: "frontend/libs/widgets/src/mode-request.ts",
  settingsPanel: "frontend/apps/bloom-dashboard/src/runtime/RuntimeSettingsPanel.tsx",
  profileOverrides: "frontend/apps/bloom-dashboard/src/runtime/runtime-profile-overrides.ts",
  runtimeProfile: "frontend/apps/bloom-dashboard/src/runtime/runtimeProfile.ts",
  app: "frontend/apps/bloom-dashboard/src/App.tsx",
  cameraStream: "frontend/apps/bloom-dashboard/src/runtime/camera-stream.ts",
  backendSettings: "backend/apps/bloom_api/settings.py",
  backendModeGrammar: "backend/libs/ros_adapters/mode_request.py",
  backendSafety: "backend/libs/ros_adapters/safety.py",
  stackTopics: "scripts/lib/stack-topics.mjs",
  runtimeDir: "frontend/apps/bloom-dashboard/src/runtime",
  routesDir: "backend/apps/bloom_api/routes",
  seedDir: "backend/seed/applications",
};
const dispatchFile = (name) => `${F.runtimeDir}/dispatch-${name}.ts`;

// The backend seam each runtime requirement needs, and the extra route a kind's own data comes through.
const BACKEND_SEAMS = {
  "command-dispatcher": ["ros.py", "/topics/publish"],
  "teleop-adapter": ["runtime_socket.py", "teleop_cmd"],
  "data-source": ["runtime_socket.py", "subscribe_topic"],
};
const BACKEND_EXTRAS = {
  camera: ["runtime_camera.py", "/camera"],
  "robot-3d": ["robot_model.py", "robot_description"],
  "position-library": ["runtime_positions.py", "/positions"],
};

/**
 * Gaps accepted on purpose, keyed "<item>|<link>". Only something with no robot side belongs here. What the
 * code itself declares UI-only (a kind needing no seam, a screen-navigation purpose, a flag parameter) is
 * recognised without an entry, so this stays empty until a real exception earns a line.
 */
const ALLOWLIST = new Map([]);

// ------------------------------------------------------------------------------------------------ sources

export function createSources(root, overrides = {}) {
  const cache = new Map();
  const read = (path) => {
    if (path in overrides) return overrides[path];
    if (!cache.has(path)) {
      const full = resolve(root, path);
      cache.set(path, existsSync(full) && statSync(full).isFile() ? readFileSync(full, "utf8") : "");
    }
    return cache.get(path);
  };
  const walk = (dir, keep, acc = []) => {
    const full = resolve(root, dir);
    if (!existsSync(full)) return acc;
    for (const entry of readdirSync(full, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!["node_modules", "dist", ".venv", "__pycache__", "coverage"].includes(entry.name)) walk(path, keep, acc);
      } else if (keep(path)) {
        acc.push(path);
      }
    }
    return acc;
  };
  return { read, walk, root };
}

/** The first file of a corpus holding the needle, as evidence, or null. */
const namedIn = (src, corpus, needle) => corpus.find((path) => src.read(path).includes(needle)) ?? null;
const isTest = (path) => /\.test\.(ts|tsx|mjs)$/.test(path);
const isRecord = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v) => (typeof v === "string" && v.length > 0 ? v : null);
const quoted = (text) => [...text.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
const between = (text, start, end) => text.match(new RegExp(`${start}([\\s\\S]*?)${end}`))?.[1] ?? "";

// --------------------------------------------------------------------------------------------- enumerators

/** Every kind the catalog defines with what it declares, plus kinds the API or the starters know and it does not. */
export function enumerateWidgetKinds(src) {
  const kinds = new Map();
  const add = (kind, source, extra = {}) => {
    if (!kinds.has(kind))
      kinds.set(kind, { kind, requirements: [], maturity: "ready", defaultSettings: "", source, ...extra });
  };
  for (const block of src
    .read(F.catalog)
    .split(/\n {2}\{\n\s+kind: /)
    .slice(1)) {
    const kind = block.match(/^"([^"]+)"/)?.[1];
    if (!kind) continue;
    add(kind, F.catalog, {
      requirements: quoted(block.match(/runtimeRequirements: \[([^\]]*)\]/)?.[1] ?? ""),
      maturity: block.match(/maturity: "(\w+)"/)?.[1] ?? "ready",
      defaultSettings: block.match(/defaultSettings: ([^,\n]+)/)?.[1] ?? "",
    });
  }
  for (const kind of quoted(between(src.read(F.kinds), "WIDGET_KINDS = \\[", "\\]")))
    add(kind, F.kinds, { missing: true });
  for (const [, kind] of src.read(F.starters).matchAll(/kind: "([^"]+)"/g)) add(kind, F.starters, { missing: true });
  return [...kinds.values()];
}

const purposeBlocks = (text, name) =>
  between(text, `${name}[\\s\\S]*?= \\[`, "\\n\\];")
    .split(/\n {2}\{/)
    .slice(1);
const field = (block, key) => block.match(new RegExp(`${key}: "([^"]+)"`))?.[1] ?? null;

/** Command purposes: a mode request, a teleop frame, or a screen to open. */
export function enumerateCommandPurposes(src) {
  return purposeBlocks(src.read(F.commandPurposes), "COMMAND_PURPOSES").map((block) => ({
    id: field(block, "id"),
    title: field(block, "title"),
    mode: block.match(/settings: mode\("([^"]+)"/)?.[1] ?? null,
    frameId: block.match(/settings: frame\("([^"]+)"/)?.[1] ?? null,
  }));
}

export function enumerateCommandPresets(src) {
  return purposeBlocks(src.read(F.presets), "ROS_MESSAGE_COMMAND_PRESETS").map((block) => ({
    id: field(block, "id"),
    command: field(block, "command"),
    messageType: field(block, "messageType"),
    topic: field(block, "topic"),
  }));
}

export function enumerateTogglePresets(src) {
  return purposeBlocks(src.read(F.presets), "ROS_MESSAGE_TOGGLE_PRESETS").map((block) => ({
    id: field(block, "id"),
    messageType: field(block, "messageType"),
  }));
}

/** Slider purposes: a limit topic, a teleop axis, or a node parameter. */
export function enumerateSliderPurposes(src) {
  const text = src.read(F.sliderPurposes);
  const speedTopic = field(between(src.read(F.paletteWiring), "\\n  slider: \\{", "\\n  \\},"), "topic");
  return purposeBlocks(text, "SLIDER_PURPOSES").map((block) => ({
    id: field(block, "id"),
    title: field(block, "title"),
    topic: field(block, "topic") ?? (block.includes("speedSliderSettings") ? speedTopic : null),
    axis: block.match(/teleopAxis\("([^"]+)"/)?.[1] ?? null,
    teleopTopic: text.match(/TELEOP_TOPIC = "([^"]+)"/)?.[1] ?? null,
    parameter: field(block, "parameter") ? `${field(block, "node")}:${field(block, "parameter")}` : null,
    max: Number(block.match(/max: ([\d.]+)/)?.[1] ?? Number.NaN),
  }));
}

/** Toggle purposes: the gripper, or a lasting behaviour switched by mode request. */
export function enumerateTogglePurposes(src) {
  const gripper = src.read(F.gripper);
  return purposeBlocks(src.read(F.togglePurposes), "TOGGLE_PURPOSES").map((block) => {
    const mode = block.match(/modeToggle\("([^"]+)"/)?.[1] ?? null;
    return {
      id: field(block, "id"),
      title: field(block, "title"),
      mode,
      topic: mode ? "/mode_request" : gripper.match(/GRIPPER_COMMAND_TOPIC = "([^"]+)"/)?.[1],
      messageType: mode ? "std_msgs/msg/String" : gripper.match(/GRIPPER_MESSAGE_TYPE = "([^"]+)"/)?.[1],
    };
  });
}

export function enumerateJoystickPurposes(src) {
  const text = src.read(F.joystickPurposes);
  const teleopTopic = text.match(/target_topic: "([^"]+)"/)?.[1] ?? null;
  return [...between(text, "JOYSTICK_PURPOSES = \\[", "\\] as const").matchAll(/id: "([^"]+)"/g)].map((m) => ({
    id: m[1],
    teleopTopic,
  }));
}

/** The operator Settings panel: each stepper's stored key and each profile override key. */
export function enumerateSettingsControls(src) {
  const keys = new Set();
  for (const [, key] of src.read(F.settingsPanel).matchAll(/settingKey="([^"]+)"/g)) {
    keys.add(key.replace(/_(\w)/g, (_, c) => c.toUpperCase()));
  }
  const type = between(src.read(F.profileOverrides), "type RuntimeProfileOverrides = \\{", "\\n\\};");
  for (const [, key] of type.matchAll(/^\s+(\w+)\?:/gm)) keys.add(key);
  return [...keys].sort();
}

/** Every mode string Bloom can put on /mode_request: any literal in the sources, and what the seeds carry. */
export function enumerateModeStrings(src, seeds, grammar = readFrontendGrammar(src)) {
  const modes = new Map();
  const add = (mode, where, emitted) => {
    if (!/^(geometric|behaviour)\/[a-z_]+(\/[a-z_]+)*$/.test(mode)) return;
    // A literal the grammar refuses is a prefix or a state key, not a request; a seed's string always counts.
    if (!emitted && !modeAccepted(mode, grammar)) return;
    modes.set(mode, modes.get(mode) ?? where);
  };
  for (const path of src.walk("frontend", (p) => /\.(ts|tsx)$/.test(p) && !isTest(p))) {
    for (const [, mode] of src.read(path).matchAll(/["'`]((?:geometric|behaviour)\/[a-z_/]+)["'`]/g))
      add(mode, path, false);
  }
  for (const seed of seeds) for (const mode of seed.modes) add(mode, seed.path, true);
  return modes;
}

/** One PALETTE_WIRING entry, with each `...CONSTANT` it spreads replaced by that constant's text. */
function paletteWiringEntry(src, kind) {
  const text = src.read(F.paletteWiring);
  const entry = between(text, `\\n  "?${kind}"?: \\{`, `(?=\\n  "?[\\w-]+"?: \\{|\\n\\};)`);
  return entry.replace(/\.\.\.(\w+)/g, (_, name) => between(text, `const ${name} = `, ";"));
}

// ---------------------------------------------------------------------------------------------------- seeds

/** The `data` of a String payload, held as an object or as ROS text. */
export function readPayloadData(payload) {
  if (isRecord(payload)) return str(payload.data);
  if (typeof payload !== "string") return null;
  return /^\{?\s*data\s*:\s*(['"]?)(.*?)\1\s*\}?$/.exec(payload.trim())?.[2] ?? null;
}

const READ_KEYS = [
  "topic",
  "jointStateTopic",
  "markerTopic",
  "targetJointTopic",
  "poseTopic",
  "goalsTopic",
  "softGoalTopic",
];

/** What each shipped app touches: publishes, teleop targets, parameters, reads, services and mode strings. */
export function loadSeeds(src) {
  return src
    .walk(F.seedDir, (p) => p.endsWith(".json"))
    .sort()
    .flatMap((path) =>
      (JSON.parse(src.read(path)).applications ?? []).map((app) => {
        const refs = [];
        const modes = new Set();
        const ref = (role, topic, extra = {}) => topic && refs.push({ role, topic, ...extra });
        const mode = (topic, payload) => {
          const data = readPayloadData(payload);
          if (data && str(topic)?.endsWith("mode_request")) modes.add(data);
        };
        for (const screen of app.screens ?? []) {
          for (const { kind, settings: s = {} } of screen.widgets ?? []) {
            const binding = isRecord(s.runtime_binding) ? s.runtime_binding : {};
            const mapping = isRecord(binding.value_mapping) ? binding.value_mapping : {};
            for (const key of ["payload", "onPayload", "offPayload", "releasedPayload"]) mode(s.topic, s[key]);
            if (binding.adapter === "parameter") {
              ref("parameter", `${mapping.node}:${mapping.parameter}`, { kind, numeric: typeof s.value === "number" });
            } else if (binding.adapter === "teleop") {
              ref("teleop", str(mapping.target_topic), { kind });
            } else if (["command-button", "gesture-pad", "slider", "toggle"].includes(kind)) {
              const messageType = str(s.messageType) ?? str(mapping.message_type);
              if (!str(s.targetScreenId)) {
                ref("publish", str(s.topic) ?? str(binding.target), {
                  kind,
                  messageType: messageType ?? (kind === "slider" ? "std_msgs/msg/Float64" : null),
                });
              }
            } else if (kind === "camera") {
              if (s.source === "ros-topic") ref("read", str(s.topic), { kind });
            } else {
              for (const key of READ_KEYS) ref("read", str(s[key]), { kind });
              for (const series of Array.isArray(s.series) ? s.series : []) ref("read", str(series?.topic), { kind });
            }
          }
        }
        for (const preset of app.action_presets ?? []) {
          if (preset.kind === "service-call") ref("service", preset.topic, { serviceType: preset.message_type });
          if (preset.kind !== "topic-publish") continue;
          ref("publish", str(preset.topic), { kind: "preset", messageType: str(preset.message_type) });
          mode(preset.topic, preset.payload_text ?? preset.payload);
        }
        return { path, id: app.id, refs, modes };
      }),
    );
}

// --------------------------------------------------------------------------------------------- backend side

/** A tuple[str, ...] field of settings.py, comments stripped so a quoted word in one is not an entry. */
function readSettingsTuple(text, name) {
  const head = `${name}: tuple\\[str, \\.\\.\\.\\] = \\(`;
  const body = between(text, `${head}\\n`, "\\n    \\)") || between(text, head, "\\)");
  return quoted(body.replace(/#.*$/gm, ""));
}

/** An entry ending in "/" grants its namespace, as safety.py ensure_allowed reads it. */
const allowed = (list, value) =>
  list.includes(value) || list.some((entry) => entry.endsWith("/") && entry !== "/" && value.startsWith(entry));

/** Each behaviour name a grammar knows, and whether it takes a target: read from the branch that names it. */
function behaviourArity(text, namePattern, targetPattern, optionalPattern) {
  const names = [...text.matchAll(namePattern)];
  return new Map(
    names.map((m, i) => {
      const branch = text.slice(m.index, names[i + 1]?.index ?? m.index + 400);
      return [m[1], targetPattern.test(branch) && !optionalPattern.test(branch)];
    }),
  );
}

export function readBackendPolicy(src) {
  const settings = src.read(F.backendSettings);
  const safety = src.read(F.backendSafety);
  const grammar = src.read(F.backendModeGrammar);
  const constants = Object.fromEntries([...safety.matchAll(/^(\w+) = "([^"]+)"/gm)].map((m) => [m[1], m[2]]));
  const tuple = (name) => readSettingsTuple(settings, name);
  return {
    messageTypes: tuple("allowed_ros_message_types"),
    publishTopics: tuple("allowed_ros_publish_topics"),
    teleopTargets: tuple("allowed_teleop_targets"),
    teleopTargetParameters: tuple("teleop_target_parameters"),
    parameters: tuple("allowed_ros_parameters"),
    serviceCalls: tuple("allowed_ros_service_calls"),
    serviceTypes: tuple("allowed_ros_service_types"),
    frameIds: tuple("allowed_command_frame_ids"),
    parameterBounds: [...safety.matchAll(/f"\{(\w+)\}:([\w.]+)", [-\w.]+, [-\w.]+\)/g)].map(
      (m) => `${constants[m[1]]}:${m[2]}`,
    ),
    topicBounds: [...safety.matchAll(/\((\w+), -?[\d.]+, -?[\d.]+\)/g)].map((m) => constants[m[1]] ?? m[1]),
    boundPatterns: [...safety.matchAll(/_(?:POSITIVE|NON_NEGATIVE)_PARAMETER = re\.compile\(r"([^"]+)"\)/g)].map(
      (m) => new RegExp(m[1]),
    ),
    grammar: {
      geometric: quoted(between(grammar, "GEOMETRIC_MODES = \\(", "\\)")),
      behaviours: behaviourArity(grammar, /parts\[1\] == "(\w+)"/g, /len\(parts\) != 3/, /len\(parts\) == 3/),
    },
  };
}

function readFrontendGrammar(src) {
  const text = src.read(F.modeGrammar);
  return {
    geometric: quoted(between(text, "GEOMETRIC_MODES = \\[", "\\]")),
    behaviours: behaviourArity(text, /name === "(\w+)"/g, /parts\.length === 3/, /parts\.length === 2/),
  };
}

function modeAccepted(mode, grammar) {
  const [family, name, ...rest] = mode.split("/");
  if (family === "geometric") return rest.length === 0 && grammar.geometric.includes(name);
  if (family !== "behaviour" || !grammar.behaviours.has(name)) return false;
  return grammar.behaviours.get(name) ? rest.length === 1 : rest.length <= 1;
}

// --------------------------------------------------------------------------------------------- manager side

/** A ROS 2 params YAML as nested maps: mappings, scalars and inline lists, by indentation. */
export function parseParamsYaml(text) {
  const root = {};
  const stack = [{ indent: -1, node: root }];
  for (const raw of text.split("\n")) {
    const line = raw.replace(/#.*$/, "").trimEnd();
    const [, key, value] = line.trim().match(/^([^:\s][^:]*):\s*(.*)$/) ?? [];
    if (!key) continue;
    const indent = line.length - line.trimStart().length;
    while (stack.at(-1).indent >= indent) stack.pop();
    const parent = stack.at(-1).node;
    if (value === "") {
      parent[key] = parent[key] ?? {};
      stack.push({ indent, node: parent[key] });
    } else {
      parent[key] = value.startsWith("[")
        ? value
            .slice(1, -1)
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean)
        : value;
    }
  }
  return root;
}

const at = (node, path) => path.split(".").reduce((n, key) => (isRecord(n) ? n[key] : undefined), node);

/** What the manager configs, and the manager's own mode parser next to them, declare. */
export function readManagerConfigs(dir) {
  const files = existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith("_params.yaml"))
        .sort()
    : [];
  if (files.length === 0) return { available: false, dir, files: [] };
  const found = {
    topics: new Set(),
    frames: new Set(),
    behaviours: new Set(),
    parameters: new Set(),
    namespaces: new Set(),
  };
  const targets = { joint_target: new Set(), pose_target: new Set() };
  for (const file of files) {
    const doc = parseParamsYaml(readFileSync(join(dir, file), "utf8"));
    const manager = at(doc, "cartesian_manager.ros__parameters") ?? {};
    for (const value of Object.values(manager.topics ?? {})) found.topics.add(value);
    for (const value of Object.values(manager.frames ?? {})) found.frames.add(value);
    for (const name of at(manager, "behaviours.joint_targets.target_names") ?? []) targets.joint_target.add(name);
    for (const name of at(manager, "behaviours.pose_targets.target_names") ?? []) targets.pose_target.add(name);
    for (const name of Object.keys(manager.behaviours ?? {})) found.behaviours.add(name);
    const walkKeys = (node, prefix) => {
      for (const [key, value] of Object.entries(node)) {
        found.parameters.add(`/cartesian_manager:${prefix}${key}`);
        if (isRecord(value)) walkKeys(value, `${prefix}${key}.`);
      }
    };
    walkKeys(manager, "");
    // qontrol's own input topics, the joint state broadcaster, the gripper's forward controller, and the
    // namespace each controller the manager starts publishes under.
    for (const [name, section] of Object.entries(doc)) {
      const params = section?.ros__parameters ?? {};
      for (const [key, value] of Object.entries(params)) if (key.startsWith("topic_")) found.topics.add(value);
      if (params.interface_name && params.joints) found.topics.add(`/${name}/commands`);
      if (name === "joint_state_broadcaster") found.topics.add("/joint_states");
    }
    for (const [controller, spec] of Object.entries(at(doc, "controller_manager.ros__parameters") ?? {})) {
      if (isRecord(spec) && spec.type) found.namespaces.add(`/${controller}/`);
    }
  }
  const managerCpp = join(dir, "..", "..", "src", "core", "manager.cpp");
  const parsed = existsSync(managerCpp) ? readFileSync(managerCpp, "utf8") : "";
  for (const [, name] of parsed.matchAll(/parts\[1\] == "(\w+)"/g)) found.behaviours.add(name);
  // The QP controller names its command topic in code, not under its controller namespace.
  const controllerSources = join(dir, "..", "..", "..", "qontrol_controllers", "src");
  for (const file of existsSync(controllerSources) ? readdirSync(controllerSources) : []) {
    if (!file.endsWith(".cpp")) continue;
    const source = readFileSync(join(controllerSources, file), "utf8");
    for (const [, topic] of source.matchAll(/create_(?:publisher|subscription)<[^>]*>\(\s*"(\/[^"]+)"/g)) {
      found.topics.add(topic);
    }
  }
  return { available: true, dir, files, targets, ...found };
}

/** null when the manager checkout knows the mode, else why it does not. */
function managerKnowsMode(mode, manager) {
  const [family, name, target] = mode.split("/");
  if (family === "geometric")
    return manager.behaviours.has("both") ? null : "manager.cpp does not parse geometric modes";
  if (manager.targets[name]) {
    return manager.targets[name].has(target) ? null : `no ${name} "${target}" in behaviours.${name}s.target_names`;
  }
  return manager.behaviours.has(name)
    ? null
    : `behaviour "${name}" is declared neither in the configs nor in manager.cpp`;
}

// ----------------------------------------------------------------------------------------------------- check

export function runPipelineWiringCheck({ root = process.cwd(), overrides = {}, managerConfigDir } = {}) {
  const src = createSources(root, overrides);
  const rows = [];
  const warnings = [];
  /** One link: evidence (a file, or any true value with `why` as text) passes; otherwise `why` is the gap. */
  const link = (item, name, evidence, why, status = "gap") => {
    const allow = ALLOWLIST.get(`${item}|${name}`);
    if (evidence)
      rows.push({ item, link: name, status: "ok", evidence: typeof evidence === "string" ? evidence : why });
    else rows.push({ item, link: name, status: allow ? "allowlisted" : status, evidence: allow ?? why });
  };
  const note = (item, name, status, text) => rows.push({ item, link: name, status, evidence: text });

  const runtimeFiles = [...src.walk(F.runtimeDir, (p) => /\.(ts|tsx)$/.test(p) && !isTest(p)), F.app];
  const testFiles = [
    ...src.walk("frontend", isTest),
    ...src.walk("backend/tests", (p) => p.endsWith(".py")),
    ...src.walk("scripts/tests", (p) => p.endsWith(".mjs")),
  ];
  const harnessFiles = src.walk(
    "scripts",
    (p) => /checks.*\.mjs$|\.sh$|\/lib\/[\w-]+\.mjs$/.test(p) && !p.includes("/tests/"),
  );
  const simChecks = harnessFiles.filter((p) => /checks.*\.mjs$/.test(p));
  const stackKeys = Object.fromEntries(
    [...src.read(F.stackTopics).matchAll(/(\w+): "(\/[^"]+)"/g)].map((m) => [m[2], m[1]]),
  );
  const policy = readBackendPolicy(src);
  const frontendGrammar = readFrontendGrammar(src);
  const seeds = loadSeeds(src);
  const manager = readManagerConfigs(
    managerConfigDir ?? process.env.BLOOM_MANAGER_CONFIG_DIR ?? defaultManagerConfigDir(root),
  );
  if (!manager.available) {
    warnings.push(
      `warning: no cartesian_manager configs at ${manager.dir}; the manager-config half of the checks is skipped`,
    );
  }
  // Frames a deployment offers: the backend default plus the tool frame the launch scripts name.
  const frameIds = new Set(policy.frameIds);
  for (const path of harnessFiles) {
    for (const [, id] of src.read(path).matchAll(/BLOOM_ROS_EE_FRAME_ID="([^"]+)"/g)) frameIds.add(id);
  }
  const testNames = (needle) => namedIn(src, testFiles, needle);
  // A sim check names a topic as a literal or through its STACK key.
  const simNames = (needle) =>
    namedIn(src, simChecks, needle) ??
    (stackKeys[needle] ? namedIn(src, simChecks, `STACK.${stackKeys[needle]}`) : null);
  const simOrTest = (...needles) =>
    needles.reduce((found, n) => found ?? (n ? (simNames(n) ?? testNames(n)) : null), null);
  const inManager = (topic) =>
    manager.available && (manager.topics.has(topic) || [...manager.namespaces].some((ns) => topic.startsWith(ns)));
  const harnessOrManager = (topic) =>
    (stackKeys[topic] ? F.stackTopics : null) ??
    namedIn(src, harnessFiles, topic) ??
    (inManager(topic) ? manager.dir : null);
  const routeHas = ([file, marker]) =>
    src.read(`${F.routesDir}/${file}`).includes(marker) ? `${F.routesDir}/${file}` : null;
  const bounded = (parameter) =>
    policy.parameterBounds.includes(parameter) ||
    policy.boundPatterns.some((p) => p.test(parameter.split(":")[1] ?? ""));
  const parameterRows = (item, parameter, numeric) => {
    link(
      item,
      "backend",
      policy.parameters.includes(parameter) && F.backendSettings,
      `${parameter} not in allowed_ros_parameters`,
    );
    if (numeric)
      link(item, "bounds", bounded(parameter) && F.backendSafety, `${F.backendSafety} bounds nothing for ${parameter}`);
    if (!manager.available || !parameter.startsWith("/cartesian_manager:")) return;
    link(
      item,
      "manager",
      manager.parameters.has(parameter) && manager.dir,
      `not declared in ${manager.files.join(",")}`,
      "external",
    );
  };
  const modeRows = (item, mode) => {
    const accepted = modeAccepted(mode, policy.grammar) && modeAccepted(mode, frontendGrammar);
    link(item, "grammar", accepted && `${F.modeGrammar} + ${F.backendModeGrammar}`, `a grammar refuses ${mode}`);
    link(
      item,
      "backend",
      allowed(policy.publishTopics, "/mode_request") && F.backendSettings,
      "/mode_request not allowed",
    );
    if (!manager.available) return note(item, "manager", "skipped", "no manager configs");
    const why = managerKnowsMode(mode, manager);
    link(item, "manager", !why && manager.dir, `${why} (${manager.dir})`, "external");
  };
  const editorOffers = (constant, file, id) =>
    src.read(F.settingsEditor).includes(constant) &&
    (src.read(file).match(new RegExp(`"${id}"`, "g")) ?? []).length >= 2;

  // 1. Widget kinds: renderer, settings editor, runtime path, backend seam, palette wiring, a seed, a test.
  const registry = src.read(F.rendererRegistry);
  const fieldTypes = quoted(between(src.read(F.settingsValidation), "WidgetSettingFieldType = ", ";"));
  const unhandledTypes = fieldTypes.filter((type) => !src.read(F.settingsField).includes(`"${type}"`));
  const previewKinds = new Set();
  for (const def of enumerateWidgetKinds(src)) {
    const item = `kind:${def.kind}`;
    const contract = src.read(`frontend/libs/widgets/src/settings/${def.kind}.ts`);
    const hasTopic = /(topic|Topic)\b\??: string/.test(contract) || contract.includes("series");
    const uiOnly = def.requirements.length > 0 && def.requirements.every((r) => r === "none") && !hasTopic;
    const acts = def.requirements.some((r) => r === "command-dispatcher" || r === "teleop-adapter");
    if (def.maturity === "preview") previewKinds.add(def.kind);
    link(item, "catalog", !def.missing && F.catalog, `${def.source} names it, ${F.catalog} does not`);
    const rendered =
      registry.includes(`kind: "${def.kind}"`) && src.read(F.rendererIndex).includes("DEFAULT_WIDGET_RENDERERS");
    link(item, "renderer", rendered && F.rendererRegistry, `${F.rendererRegistry} registers no renderer`);
    const contracted = new RegExp(`(^|\\s|")${def.kind}"?: \\w+Contract`).test(src.read(F.settingsContracts));
    const edited =
      contracted && unhandledTypes.length === 0 && src.read(F.settingsEditor).includes("getWidgetSettingsContract");
    link(
      item,
      "builder-settings",
      edited && `${F.settingsContracts} + ${F.settingsEditor}`,
      contracted
        ? `${F.settingsField} handles no ${unhandledTypes.join(",")} field`
        : `${F.settingsContracts} has no contract for ${def.kind}`,
    );
    if (uiOnly) {
      for (const name of ["runtime", "backend", "palette-wiring"]) note(item, name, "ui-only", "no robot side");
    } else {
      const runtime = acts
        ? src.read(F.intents).includes(`widget.kind === "${def.kind}"`) && F.intents
        : def.kind === "camera"
          ? src.read(F.cameraStream).includes('"camera"') && F.cameraStream
          : namedIn(src, runtimeFiles, `"${def.kind}"`);
      link(
        item,
        "runtime",
        runtime,
        acts ? `${F.intents} produces no intent for ${def.kind}` : `nothing under ${F.runtimeDir} reads ${def.kind}`,
      );
      const seams = def.requirements.filter((r) => BACKEND_SEAMS[r]).map((r) => routeHas(BACKEND_SEAMS[r]));
      const extra = BACKEND_EXTRAS[def.kind] ? routeHas(BACKEND_EXTRAS[def.kind]) : "";
      link(
        item,
        "backend",
        seams.every(Boolean) && extra !== null && [...seams, extra].filter(Boolean).join(" + "),
        `no backend seam for ${def.requirements.join(",")}`,
      );
      const wiring = paletteWiringEntry(src, def.kind);
      const placedBy = def.defaultSettings.includes("Settings(")
        ? src.read(F.joystickPurposes) + src.read(F.gripper)
        : "";
      const placed =
        /topic|target_topic|series/.test(wiring + placedBy) ||
        /(topic|Topic): "\/[^"]+"/.test(contract) ||
        contract.includes("plot_id");
      link(
        item,
        "palette-wiring",
        placed && (wiring ? F.paletteWiring : `frontend/libs/widgets/src/settings/${def.kind}.ts defaults`),
        `${F.paletteWiring} places ${def.kind} without a topic`,
        def.maturity === "preview" ? "preview" : "gap",
      );
    }
    const seed = seeds.find((s) => src.read(s.path).includes(`"kind": "${def.kind}"`));
    if (seed || !uiOnly) link(item, "seed", seed?.path, "no shipped seed places it");
    else note(item, "seed", "ui-only", "no shipped seed places it");
    link(item, "test", testNames(`"${def.kind}"`), `no test names "${def.kind}"`);
  }

  // Every intent the widgets library can produce reaches a handler in the dashboard.
  const handlers = runtimeFiles.filter((p) => !p.endsWith("dispatch-result.ts"));
  for (const [, type] of between(src.read(F.intents), "type WidgetActionIntent =", "\\n\\};\\n").matchAll(
    /type: "([\w-]+)"/g,
  )) {
    if (type === "unsupported") note(`intent:${type}`, "runtime", "ui-only", "the refusal itself");
    else link(`intent:${type}`, "runtime", namedIn(src, handlers, `"${type}"`), `no dashboard file handles "${type}"`);
  }

  // 2. Purposes and presets: Builder choice, dispatch path, backend allowlists, manager grammar, a test.
  const dispatches = (name, marker) => src.read(dispatchFile(name)).includes(marker) && dispatchFile(name);
  for (const purpose of enumerateCommandPurposes(src)) {
    const item = `command-purpose:${purpose.id}`;
    link(
      item,
      "builder",
      editorOffers("COMMAND_PURPOSES", F.commandPurposes, purpose.id) && `${F.settingsEditor} + commandPurposeOf`,
      "not offered or not read back",
    );
    if (purpose.mode) {
      link(item, "dispatch", dispatches("topics", "createRosTopicPublishRequest"), "no topic publish path");
      modeRows(item, purpose.mode);
    } else if (purpose.frameId) {
      link(item, "dispatch", dispatches("teleop", "dispatchTeleopFrameIntent"), "no frame dispatch path");
      link(
        item,
        "backend",
        frameIds.has(purpose.frameId) &&
          `${F.backendSettings} allowed_command_frame_ids or BLOOM_ROS_EE_FRAME_ID in scripts/*.sh`,
        `frame "${purpose.frameId}" is offered by no deployment setting`,
      );
      if (manager.available)
        link(
          item,
          "manager",
          manager.frames.has(purpose.frameId) && manager.dir,
          `no frames.* names ${purpose.frameId}`,
          "external",
        );
      else note(item, "manager", "skipped", "no manager configs");
    } else {
      link(item, "dispatch", namedIn(src, runtimeFiles, '"screen-navigation"'), "no screen-navigation handler");
      for (const name of ["backend", "manager"])
        note(item, name, "ui-only", "opens a screen, never leaves the browser");
    }
    link(
      item,
      "sim-or-test",
      simOrTest(`"${purpose.id}"`, purpose.mode, purpose.frameId, `"${purpose.title}"`),
      `no sim check or test names ${purpose.id}`,
    );
  }
  for (const preset of enumerateCommandPresets(src)) {
    const item = `command-preset:${preset.id}`;
    const topicOk = allowed(policy.publishTopics, preset.topic) && policy.messageTypes.includes(preset.messageType);
    link(
      item,
      "backend",
      topicOk && F.backendSettings,
      `${preset.topic} or ${preset.messageType} not allowed by ${F.backendSettings}`,
    );
    if (preset.topic.endsWith("mode_request")) modeRows(item, preset.command);
    link(item, "sim-or-test", simOrTest(`"${preset.id}"`, preset.command), `no sim check or test names ${preset.id}`);
  }
  for (const preset of enumerateTogglePresets(src)) {
    const item = `toggle-preset:${preset.id}`;
    link(
      item,
      "backend",
      policy.messageTypes.includes(preset.messageType) && F.backendSettings,
      `${preset.messageType} not in allowed_ros_message_types`,
    );
    link(
      item,
      "sim-or-test",
      simOrTest(`"${preset.id}"`, preset.messageType),
      `no sim check or test names ${preset.id}`,
    );
  }
  for (const purpose of enumerateSliderPurposes(src)) {
    const item = `slider-purpose:${purpose.id}`;
    link(
      item,
      "builder",
      editorOffers("SLIDER_PURPOSES", F.sliderPurposes, purpose.id) && `${F.settingsEditor} + sliderPurposeOf`,
      "not offered or not read back",
    );
    if (purpose.parameter) {
      link(item, "dispatch", dispatches("parameters", "createParameterRequest"), "no parameter path");
      parameterRows(item, purpose.parameter, true);
    } else if (purpose.axis) {
      link(item, "dispatch", dispatches("teleop", "createTeleopCommandRequest"), "no teleop path");
      link(
        item,
        "backend",
        allowed(policy.teleopTargets, purpose.teleopTopic) && F.backendSettings,
        `${purpose.teleopTopic} not a teleop target`,
      );
    } else {
      link(item, "dispatch", dispatches("topics", "createValueTopicPublishRequest"), "no value publish path");
      link(
        item,
        "backend",
        allowed(policy.publishTopics, purpose.topic ?? "") && F.backendSettings,
        `${purpose.topic} not allowed`,
      );
      link(
        item,
        "bounds",
        policy.topicBounds.includes(purpose.topic) && `${F.backendSafety} DEFAULT_TOPIC_VALUE_BOUNDS`,
        `${F.backendSafety} bounds nothing on ${purpose.topic}`,
      );
    }
    link(
      item,
      "sim-or-test",
      simOrTest(`"${purpose.id}"`, purpose.parameter?.split(":")[1], purpose.topic, purpose.axis, `"${purpose.title}"`),
      `no sim check or test names ${purpose.id}`,
    );
  }
  for (const purpose of enumerateTogglePurposes(src)) {
    const item = `toggle-purpose:${purpose.id}`;
    link(
      item,
      "builder",
      editorOffers("TOGGLE_PURPOSES", F.togglePurposes, purpose.id) && `${F.settingsEditor} + togglePurposeOf`,
      "not offered or not read back",
    );
    link(item, "dispatch", dispatches("topics", "dispatchTopicPublishIntent"), "no topic publish path");
    if (purpose.mode) modeRows(item, purpose.mode);
    else {
      link(
        item,
        "backend",
        allowed(policy.publishTopics, purpose.topic) &&
          policy.messageTypes.includes(purpose.messageType) &&
          F.backendSettings,
        `${purpose.topic} or ${purpose.messageType} not allowed`,
      );
      if (manager.available)
        link(
          item,
          "manager",
          manager.topics.has(purpose.topic) && `${manager.dir} (gripper_controller)`,
          `no controller in the configs takes ${purpose.topic}`,
          "external",
        );
    }
    link(
      item,
      "sim-or-test",
      simOrTest(`"${purpose.id}"`, purpose.mode, purpose.topic, `"${purpose.title}"`),
      `no sim check or test names ${purpose.id}`,
    );
  }
  for (const purpose of enumerateJoystickPurposes(src)) {
    const item = `joystick-purpose:${purpose.id}`;
    link(item, "builder", src.read(F.settingsEditor).includes("JOYSTICK_PURPOSES") && F.settingsEditor, "not offered");
    link(item, "dispatch", dispatches("teleop", "createTeleopCommandRequest"), "no teleop path");
    link(
      item,
      "backend",
      allowed(policy.teleopTargets, purpose.teleopTopic ?? "") && F.backendSettings,
      `${purpose.teleopTopic} not a teleop target`,
    );
    if (manager.available)
      link(
        item,
        "manager",
        manager.topics.has(purpose.teleopTopic) && manager.dir,
        `no topics.* names ${purpose.teleopTopic}`,
        "external",
      );
    link(item, "sim-or-test", simOrTest(`"${purpose.id}"`), `no sim check or test names ${purpose.id}`);
  }

  // 3. Settings controls: normalised, applied, consumed by the runtime, named by a test.
  const consumers = runtimeFiles.filter((p) => ![F.settingsPanel, F.profileOverrides, F.runtimeProfile].includes(p));
  for (const key of enumerateSettingsControls(src)) {
    const item = `setting:${key}`;
    link(
      item,
      "normalized",
      src.read(F.profileOverrides).includes(key) && F.profileOverrides,
      `${F.profileOverrides} drops ${key}`,
    );
    link(
      item,
      "applied",
      src.read(F.runtimeProfile).includes(key) && F.runtimeProfile,
      `${F.runtimeProfile} ignores ${key}`,
    );
    // A resolver named after the key, exported by the profile module, is a consumer too.
    const resolver = new RegExp(`export function \\w*${key[0].toUpperCase()}${key.slice(1)}\\w*\\(`).test(
      src.read(F.runtimeProfile),
    );
    link(
      item,
      "consumed",
      namedIn(src, consumers, key) ?? (resolver && `${F.runtimeProfile} (resolver)`),
      `nothing under ${F.runtimeDir} reads ${key}`,
    );
    link(item, "test", testNames(key), `no test names ${key}`);
  }

  // 4. Mode strings: both grammars, the backend allowlist, the manager checkout, a sim check or test.
  for (const [mode, where] of enumerateModeStrings(src, seeds, frontendGrammar)) {
    modeRows(`mode:${mode}`, mode);
    link(`mode:${mode}`, "sim-or-test", simOrTest(mode), `no sim check or test names ${mode} (emitted from ${where})`);
  }

  // 5. Seed topics and parameters: backend allowlists and bounds, the harness or the manager configs, a test.
  const refs = new Map();
  for (const seed of seeds) {
    for (const ref of seed.refs) {
      const key = `${ref.role}:${ref.topic}`;
      const entry = refs.get(key) ?? { ...ref, apps: new Set(), kinds: new Set(), types: new Set(), numeric: false };
      entry.apps.add(seed.id);
      entry.kinds.add(ref.kind);
      if (ref.messageType) entry.types.add(ref.messageType);
      entry.numeric ||= Boolean(ref.numeric);
      refs.set(key, entry);
    }
  }
  // A manager input is read live from its topics.* parameters; the backend's static list is only the default.
  const readsLive = policy.teleopTargetParameters.some((p) => p.includes(":topics."));
  for (const ref of [...refs.values()].sort((a, b) => a.topic.localeCompare(b.topic))) {
    const item = `seed-${ref.role}:${ref.topic}`;
    const apps = [...ref.apps].join(",");
    // A topic only preview widgets read is reported, not failed: the catalog says nobody serves it yet.
    const soft = [...ref.kinds].every((k) => previewKinds.has(k)) ? "preview" : "gap";
    if (ref.role === "parameter") {
      parameterRows(item, ref.topic, ref.numeric);
      link(
        item,
        "sim-or-test",
        simOrTest(ref.topic.split(":")[1]),
        `no sim check or test names ${ref.topic} (${apps})`,
        soft,
      );
      continue;
    }
    if (ref.role === "publish") {
      link(
        item,
        "backend-topic",
        allowed(policy.publishTopics, ref.topic) && F.backendSettings,
        `${ref.topic} not in allowed_ros_publish_topics (${apps})`,
      );
      const badTypes = [...ref.types].filter((t) => !policy.messageTypes.includes(t));
      link(
        item,
        "backend-type",
        badTypes.length === 0 && F.backendSettings,
        `${badTypes.join(",")} not in allowed_ros_message_types (${apps})`,
      );
    } else if (ref.role === "teleop") {
      const live =
        readsLive &&
        manager.available &&
        manager.topics.has(ref.topic) &&
        `${F.backendSettings} teleop_target_parameters, read live`;
      link(
        item,
        "backend-target",
        (allowed(policy.teleopTargets, ref.topic) && F.backendSettings) || live,
        `${ref.topic} is neither a static teleop target nor a manager input (${apps})`,
      );
    } else if (ref.role === "service") {
      link(
        item,
        "backend-service",
        allowed(policy.serviceCalls, ref.topic) && policy.serviceTypes.includes(ref.serviceType) && F.backendSettings,
        `${ref.topic} not allowed (${apps})`,
      );
    }
    link(
      item,
      "harness-or-manager",
      harnessOrManager(ref.topic),
      `neither the sim harness nor the manager configs name ${ref.topic} (${apps}: ${[...ref.kinds].join(",")})`,
      soft,
    );
    link(item, "sim-or-test", simOrTest(ref.topic), `no sim check or test names ${ref.topic} (${apps})`, soft);
  }

  // The backend's own live-tuning allowlist: every numeric parameter is bounded and the manager declares it.
  for (const parameter of policy.parameters) {
    const item = `allowed-parameter:${parameter}`;
    if (parameter.endsWith(".enabled")) note(item, "bounds", "ui-only", "a flag");
    parameterRows(item, parameter, !parameter.endsWith(".enabled"));
  }

  return {
    rows,
    gaps: rows.filter((r) => r.status === "gap"),
    externals: rows.filter((r) => r.status === "external"),
    warnings,
  };
}

// ---------------------------------------------------------------------------------------------------- report

function printReport({ rows, gaps, externals, warnings }) {
  for (const warning of warnings) console.log(warning);
  const width = Math.max(...rows.map((r) => r.item.length));
  const linkWidth = Math.max(...rows.map((r) => r.link.length));
  console.log(`${"item".padEnd(width)} | ${"link".padEnd(linkWidth)} | status      | evidence`);
  for (const r of rows)
    console.log(`${r.item.padEnd(width)} | ${r.link.padEnd(linkWidth)} | ${r.status.padEnd(11)} | ${r.evidence}`);
  const count = (status) => rows.filter((r) => r.status === status).length;
  const items = new Set(rows.map((r) => r.item)).size;
  console.log(
    `Pipeline wiring check: ${items} items, ${rows.length} links, ${count("ok")} ok, ${gaps.length} gaps, ${externals.length} external, ${count("preview")} preview, ${count("allowlisted")} allowlisted, ${count("ui-only")} ui-only, ${count("skipped")} skipped`,
  );
  if (gaps.length > 0) {
    console.error("Pipeline wiring check failed:");
    for (const gap of gaps) console.error(`- ${gap.item} ${gap.link}: ${gap.evidence}`);
  }
  return gaps.length === 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(printReport(runPipelineWiringCheck()) ? 0 : 1);
}
