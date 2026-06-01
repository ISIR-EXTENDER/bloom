# Contributing

Bloom keeps a linear, reviewable history.

## Branches

- `main` is the stable branch.
- Work happens on short-lived feature branches.
- Prefer branch names such as `feat/widget-registry`, `fix/backend-health`, or `docs/migration-plan`.

## Commits

Use Conventional Commits:

```text
<type>(<scope>): <description>
```

Examples:

- `feat(widgets): add command button schema`
- `fix(api): validate topic names`
- `docs: document migration phase one`

Keep commits focused. If a commit mixes unrelated work, split it before opening the PR.

## Pull Requests

- Open PRs against `main`.
- Keep PRs small enough to review comfortably.
- Rebase on `main` before merge if the branch is behind.
- Use squash merge for feature branches unless the PR intentionally contains a curated stack of atomic commits.
- Do not use merge commits.

## Required Local Checks

Backend:

```bash
cd backend
make test
```

Frontend:

```bash
npm install
npm run build
npm run test
```

