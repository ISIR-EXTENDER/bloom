import assert from "node:assert/strict";
import { test } from "node:test";
import { changelogSection } from "../changelog-section.mjs";

const CHANGELOG = `# Changelog

## [Unreleased]

### Added

- Something not shipped yet.

## [0.4.1] - 2026-09-26

### Fixed

- The thing that broke.

## [0.4.0] - 2026-09-26

### Added

- The thing.
`;

test("a version's section runs up to the next heading", () => {
  assert.equal(changelogSection(CHANGELOG, "0.4.1"), "### Fixed\n\n- The thing that broke.");
});

test("the oldest section runs to the end of the file", () => {
  assert.equal(changelogSection(CHANGELOG, "0.4.0"), "### Added\n\n- The thing.");
});

test("a version without a section is null, so the release stops", () => {
  assert.equal(changelogSection(CHANGELOG, "0.5.0"), null);
});

test("a prefix of a version is not a match", () => {
  assert.equal(changelogSection(CHANGELOG, "0.4"), null);
});
