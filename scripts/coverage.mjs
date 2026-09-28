#!/usr/bin/env node
// Frontend coverage, one package at a time. Vitest is never run from the frontend root: each workspace has
// its own environment and setup, so each measures itself and this merges the summaries.
//
//   npm run coverage              every package, then a table and coverage/frontend-summary.json
//   npm run coverage -- --files 25   also the 25 least-covered files with at least 20 statements
//
// A package below its own thresholds fails its run; the table still prints for every package.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PACKAGES = [
  ["@bloom/api-client", "frontend/libs/api-client"],
  ["@bloom/widgets", "frontend/libs/widgets"],
  ["@bloom/ui", "frontend/libs/ui"],
  ["@bloom/widget-renderers", "frontend/libs/widget-renderers"],
  ["@bloom/dashboard", "frontend/apps/bloom-dashboard"],
];
const MIN_STATEMENTS = 20;

const args = process.argv.slice(2);
const filesIndex = args.indexOf("--files");
const leastCovered = filesIndex === -1 ? 0 : Number(args[filesIndex + 1] ?? 25);
const only = args.includes("--summary-only");

const failed = [];
if (!only) {
  for (const [name] of PACKAGES) {
    console.log(`\n==> ${name}`);
    const run = spawnSync("npm", ["run", "coverage", "--workspace", name], { stdio: "inherit" });
    if (run.status !== 0) failed.push(name);
  }
}

const pct = (metric) => (metric.total === 0 ? 100 : (100 * metric.covered) / metric.total);
const fmt = (value) => value.toFixed(2).padStart(6);

const merged = {};
const files = [];
for (const [name, dir] of PACKAGES) {
  const path = join(dir, "coverage", "coverage-summary.json");
  if (!existsSync(path)) {
    merged[name] = null;
    continue;
  }
  const summary = JSON.parse(readFileSync(path, "utf8"));
  const total = summary.total;
  merged[name] = {
    lines: pct(total.lines),
    branches: pct(total.branches),
    functions: pct(total.functions),
    statements: pct(total.statements),
    counts: total,
  };
  for (const [file, metrics] of Object.entries(summary)) {
    if (file === "total") continue;
    files.push({
      package: name,
      file: file.slice(file.indexOf(dir) === -1 ? 0 : file.indexOf(dir)),
      lines: pct(metrics.lines),
      branches: pct(metrics.branches),
      statements: metrics.statements.total,
    });
  }
}

console.log("\npackage                    lines  branches  functions  statements");
for (const [name, entry] of Object.entries(merged)) {
  if (!entry) {
    console.log(`${name.padEnd(26)} (no coverage summary)`);
    continue;
  }
  console.log(
    `${name.padEnd(26)}${fmt(entry.lines)}  ${fmt(entry.branches)}    ${fmt(entry.functions)}     ${fmt(entry.statements)}`,
  );
}

if (leastCovered > 0) {
  console.log(`\nleast-covered files (>= ${MIN_STATEMENTS} statements)`);
  const ranked = files
    .filter((entry) => entry.statements >= MIN_STATEMENTS)
    .sort((a, b) => a.lines - b.lines || a.branches - b.branches)
    .slice(0, leastCovered);
  for (const entry of ranked) {
    console.log(`${fmt(entry.lines)}  ${fmt(entry.branches)}  ${String(entry.statements).padStart(5)}  ${entry.file}`);
  }
}

mkdirSync("coverage", { recursive: true });
writeFileSync("coverage/frontend-summary.json", `${JSON.stringify(merged, null, 2)}\n`);

if (failed.length > 0) {
  console.error(`\ncoverage failed for: ${failed.join(", ")}`);
  process.exit(1);
}
