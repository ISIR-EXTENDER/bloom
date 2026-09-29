#!/usr/bin/env node
/**
 * Print one version's section of CHANGELOG.md, for the release draft.
 *
 *   node scripts/changelog-section.mjs 0.4.1
 *
 * Exits non-zero when the version has no section: a tag without release notes is not ready to ship.
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function changelogSection(changelog, version) {
  const lines = changelog.split("\n");
  const start = lines.findIndex((line) => line.startsWith(`## [${version}]`));
  if (start === -1) {
    return null;
  }
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith("## "));
  return rest
    .slice(0, end === -1 ? rest.length : end)
    .join("\n")
    .trim();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const version = process.argv[2];
  if (!version) {
    console.error("usage: changelog-section.mjs <version>");
    process.exit(2);
  }
  const section = changelogSection(readFileSync("CHANGELOG.md", "utf8"), version);
  if (section === null) {
    console.error(`CHANGELOG.md has no "## [${version}]" section.`);
    process.exit(1);
  }
  process.stdout.write(`${section}\n`);
}
