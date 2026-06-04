# 0081 - Design System Documentation As Project Infrastructure

Date: 2026-06-04

## Context

Bloom is becoming an open-source-style project, not just a local interface rewrite. The visual system matters because
future contributors will need to understand why Bloom avoids dark/game-like robotics UI, why tokens exist, how app themes
should work, and what quality bar is expected for tablet/runtime screens.

## Decision

Add `docs/design-system.md` as the maintained source for:

- visual intent and mood-board references;
- design principles;
- token model;
- theme presets;
- touch/tablet rules;
- builder/runtime guidelines;
- current critiques and follow-ups;
- contribution rules for UI work.

Reference this document from the README, architecture notes, and `frontend/libs/ui`.

## Consequences

- UI choices are easier to review because reviewers can compare changes against documented principles.
- Bloom can stay visually coherent even when app-specific themes become more customizable.
- Future contributors have a place to document design debt instead of hiding it in CSS comments or chat history.
