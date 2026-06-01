# 0003: Keep A Linear Pull Request History

Date: 2026-06-01

## Decision

Bloom should use a linear Git history.

The preferred merge strategy is squash merge for normal feature branches. A rebase merge can be used only when a PR is intentionally curated as a stack of meaningful atomic commits.

Merge commits should be disabled.

## Context

Bloom is starting as a migration monorepo from existing frontend and backend code. The migration will be easier to review and debug if each PR has a focused scope and the final history reads as a clean sequence of changes.

## Consequences

- PRs target `main`.
- Branches should be rebased or updated before merge.
- CI checks should pass before merge.
- GitHub should be configured with:
  - require pull request before merging
  - require linear history
  - disable merge commits
  - allow squash merge
  - optionally allow rebase merge for curated atomic PRs
  - delete head branches after merge
