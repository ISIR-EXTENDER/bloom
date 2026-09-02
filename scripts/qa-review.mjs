#!/usr/bin/env node
/**
 * Product QA sweep for gaps the test suites cannot see.
 *
 * Every check here exists because something real slipped through a green build:
 *
 * - **Dead exports.** A gateway method with passing unit tests that nothing
 *   ever called, and a widget default whose edit silently matched nothing.
 *   Tests assert behaviour, so code no caller reaches stays green forever.
 * - **Stale build artifacts.** A cached `tsbuildinfo` reported a clean build
 *   while `main` was broken.
 * - **Fixtures outside the policy gate.** A fixture used by tests but not
 *   registered in the coherence check drifts from the backend silently.
 * - **Duplicated key formats.** The same storage key built three different
 *   ways; change one and lookups quietly stop resolving.
 *
 * Reports findings and exits non-zero. Run it before a release, and after any
 * change that adds an export, a fixture, or a stored key.
 */
import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const findings = [];
const notes = [];

function finding(check, detail) {
  findings.push({ check, detail });
}

function listFiles(dir, predicate, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".venv") continue;
      listFiles(path, predicate, acc);
    } else if (predicate(path)) {
      acc.push(path);
    }
  }
  return acc;
}

// ---------------------------------------------------------------- dead exports
function checkDeadExports() {
  const sources = [
    ...listFiles("frontend/apps/bloom-dashboard/src", (p) => /\.tsx?$/.test(p)),
    ...listFiles("frontend/libs", (p) => /\.tsx?$/.test(p)),
  ];

  const declared = new Map();
  for (const path of sources) {
    if (/\.test\.tsx?$/.test(path)) continue;
    const text = readFileSync(path, "utf8");
    const pattern = /^export (?:async )?function (\w+)|^export const (\w+)|^export class (\w+)/gm;
    for (const match of text.matchAll(pattern)) {
      const name = match[1] ?? match[2] ?? match[3];
      declared.set(name, (declared.get(name) ?? []).concat(path));
    }
  }

  const counts = new Map();
  for (const path of sources) {
    for (const token of readFileSync(path, "utf8").matchAll(/[A-Za-z_$][\w$]*/g)) {
      counts.set(token[0], (counts.get(token[0]) ?? 0) + 1);
    }
  }

  for (const [name, paths] of [...declared].sort()) {
    if ((counts.get(name) ?? 0) <= paths.length) {
      finding("dead-export", `${name} is exported by ${paths[0]} and referenced nowhere`);
    }
  }
  notes.push(`checked ${declared.size} frontend exports`);
}

// ------------------------------------------------------- fixtures in the gate
function checkFixtureCoverage() {
  const check = readFileSync("scripts/frontend-backend-coherence-check.mjs", "utf8");
  const fixtures = readdirSync("tests/fixtures").filter((name) => name.endsWith(".json"));

  for (const fixture of fixtures) {
    const text = readFileSync(join("tests/fixtures", fixture), "utf8");
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      finding("fixture-invalid", `tests/fixtures/${fixture} is not valid JSON`);
      continue;
    }
    // Only app bundles carry runtime policy worth gating.
    if (!parsed?.applications?.length) continue;
    // Match the whole filename. A substring test passed `configuration-bundle.json`
    // for years because `sandbox-v0-configuration-bundle.json` contains it.
    if (!new RegExp(`/${fixture.replaceAll(".", "\\.")}"`).test(check)) {
      finding(
        "fixture-ungated",
        `tests/fixtures/${fixture} declares applications but is not registered in the coherence check`,
      );
    }
  }
  notes.push(`checked ${fixtures.length} fixtures`);
}

// -------------------------------------------------------- duplicated key logic
function checkDuplicatedPreferenceKeys() {
  const sources = listFiles("frontend/apps/bloom-dashboard/src", (p) => /\.tsx?$/.test(p) && !/\.test\./.test(p));
  const sites = [];
  for (const path of sources) {
    const text = readFileSync(path, "utf8");
    // the `${configId}:${appId}` storage key, however it is spelled
    if (/\$\{[\w.]*[Cc]onfigId\}:\$\{[\w.]*[Aa]ppId\}/.test(text)) {
      sites.push(path);
    }
  }
  if (sites.length > 1) {
    finding("duplicated-key", `the runtime preference key is built in ${sites.length} places: ${sites.join(", ")}`);
  }
  notes.push(`checked runtime preference key construction`);
}

// ------------------------------------------------------------- stale build info
function checkBuildInfoIsNeverCommitted() {
  // A tsbuildinfo on disk is normal after a build; a check that flagged that
  // would fail every run and be ignored. What actually matters is that one can
  // never be committed, because then CI would inherit a cache and could report
  // a clean build for a broken tree, which is how a broken build reached main.
  let tracked = "";
  try {
    tracked = execSync("git ls-files '*.tsbuildinfo'", { encoding: "utf8" }).trim();
  } catch {
    return;
  }
  if (tracked) {
    finding("committed-buildinfo", `tsbuildinfo files are tracked by git: ${tracked.split("\n").join(", ")}`);
    return;
  }

  const ignore = existsSync(".gitignore") ? readFileSync(".gitignore", "utf8") : "";
  if (!/^\*\.tsbuildinfo$/m.test(ignore)) {
    finding(
      "buildinfo-not-ignored",
      "*.tsbuildinfo is not in .gitignore, so a build cache could be committed and make CI trust a stale build",
    );
  }
}

// ------------------------------------------------------------------- shebangs
function checkShebangsAreFirst() {
  // A shebang is only a shebang on line 1. Inserting a banner above one turns
  // the file into invalid JavaScript, and a formatter will then happily
  // reformat the wreckage. That happened while writing this sweep.
  for (const path of listFiles("scripts", (p) => /\.(mjs|sh)$/.test(p))) {
    const lines = readFileSync(path, "utf8").split("\n");
    const shebangIndex = lines.findIndex((line) => line.startsWith("#!"));
    if (shebangIndex > 0) {
      finding("misplaced-shebang", `${path} has a shebang on line ${shebangIndex + 1}; it is only valid on line 1`);
    }
  }
  notes.push("checked script shebangs");
}

// ------------------------------------------------------------ version agreement
function checkVersionAgreement() {
  try {
    execSync("node scripts/version-consistency-check.mjs", { stdio: "pipe" });
  } catch {
    finding("version-drift", "the three version sources disagree; run npm run check:version");
  }
}

// ------------------------------------------------- archived apps are not gates
function checkArchivedAppsDeclared() {
  const fixtures = readdirSync("tests/fixtures").filter((n) => n.endsWith(".json"));
  for (const fixture of fixtures) {
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(join("tests/fixtures", fixture), "utf8"));
    } catch {
      continue;
    }
    for (const app of parsed?.applications ?? []) {
      if (app.lifecycle && !["active", "archived"].includes(app.lifecycle)) {
        finding("bad-lifecycle", `${fixture}: application ${app.id} has lifecycle "${app.lifecycle}"`);
      }
    }
  }
}

checkDeadExports();
checkFixtureCoverage();
checkDuplicatedPreferenceKeys();
checkBuildInfoIsNeverCommitted();
checkShebangsAreFirst();
checkVersionAgreement();
checkArchivedAppsDeclared();

for (const note of notes) {
  console.log(`  ${note}`);
}

if (findings.length === 0) {
  console.log("\nQA review passed: no gaps found.");
  process.exit(0);
}

console.error(`\nQA review found ${findings.length} gap(s):`);
for (const { check, detail } of findings) {
  console.error(`  [${check}] ${detail}`);
}
process.exit(1);
