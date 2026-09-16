# Contributing

Bloom keeps a linear, reviewable history.

## Branches

- `main` is the stable branch.
- Work happens on short-lived feature branches.
- Prefer branch names such as `feat/widget-registry`, `fix/backend-health`, or `docs/operator-guide`.

## Commits

Use Conventional Commits:

```text
<type>(<scope>): <description>
```

Examples:

- `feat(widgets): add command button schema`
- `fix(api): validate topic names`
- `docs: refresh the operator runtime guide`

Keep commits focused. If a commit mixes unrelated work, split it before opening the PR.

## Pull Requests

- Open PRs against `main`.
- Keep PRs small enough to review comfortably.
- Rebase on `main` before merge if the branch is behind.
- Use squash merge for feature branches unless the PR intentionally contains a curated stack of atomic commits.
- Do not use merge commits.
- When using `gh pr merge --squash`, prefer the default generated squash subject so GitHub keeps the PR number suffix, for example `feat(cli): add backend command line (#3)`.

## Required Local Checks

Backend:

```bash
cd backend
make test
```

Frontend:

```bash
npm install
npm run check
npm run build
npm run test
```

Robot-facing, security, or visible runtime changes should also run the relevant validation commands from
[`docs/release-checklist.md`](docs/release-checklist.md).
