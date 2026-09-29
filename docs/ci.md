# Continuous integration

What runs on every change, what runs on a tag, what only a lab machine can run, and the repository settings that
make the checks binding. The workflows are in `.github/workflows/`; the settings are applied with the `gh api`
commands below, because they live in GitHub and not in the tree.

## Workflows

| workflow | trigger | what it proves |
| --- | --- | --- |
| `ci.yml` | every pull request, every push to `main` | the gate: backend on Python 3.10 and 3.12, frontend lint/build/test/contracts, coverage thresholds, Builder end-to-end, the visual smoke and the screen sweep, dependency audits, secret scan, Bandit, the dynamic security smoke, and a dependency review on PRs. One job, **Gate**, is green only when every other job is. |
| `codeql.yml` | pull request, push to `main`, Mondays 05:17 UTC | CodeQL `security-and-quality` on JavaScript/TypeScript and Python; findings land in the Security tab. |
| `release.yml` | a `vX.Y.Z` tag | every version carrier equals the tag (`npm run check:version`), the full gate, the dashboard build packaged with its checksum, a CycloneDX SBOM, and a **draft** GitHub release carrying this version's CHANGELOG section. Publishing the draft is a human decision. |
| `ros-sim-nightly.yml` | weeknights 02:30 UTC, or by hand | `npm run e2e:sim` for both arms on a lab machine. Skipped, not queued, until a runner is registered (below). |

Conventions every workflow follows:

- `permissions: {}` at the top; each job asks for what it needs (`contents: read`, `security-events: write` for
  CodeQL, `contents: write` for the release draft).
- `concurrency` cancels a superseded run of the same PR or branch; the release and the nightly never cancel.
- `timeout-minutes` on every job.
- Every third-party action is pinned to a commit SHA with its version in a comment. Dependabot bumps the SHA and the
  comment together (`.github/dependabot.yml`, weekly, grouped: npm, uv, actions).
- Failure captures (Playwright traces and screenshots, smoke PNGs, the API log) are uploaded on failure only and kept
  five days. Coverage reports are kept five days too.
- npm, uv and the Playwright Chromium build are cached; a lockfile change invalidates the cache.

## Where the minutes go

Measured on run `36462665672` (`main`, 2026-09-28, before the split):

| job | wall clock | the long step |
| --- | --- | --- |
| Visual | 500 s | visual smoke 285 s, screen sweep 172 s, Chromium install 27 s |
| Frontend | 205 s | `npm run test` 171 s (five vitest workspaces, one after the other) |
| Backend (py3.12) | 69 s | pytest 58 s |
| Backend (py3.10) | 64 s | pytest 53 s |
| Builder end-to-end | 54 s | Chromium install 26 s |
| Security | 31 s | |

About 15.4 billed minutes per run; a public repository pays none of them. The wall clock was bound by Visual at
8.3 min, over the 8 min a reviewer will wait for, so the visual job is now a two-way matrix (`smoke`, `sweep`) and the
longest job is the smoke at about 5 min. The frontend tests stay in one job: 3.4 min, and a per-workspace matrix would
pay `npm ci` five times to save two minutes. The coverage job re-runs both suites with instrumentation, so budget
another five minutes of billed time; CodeQL adds roughly eight in its own workflow.

## Coverage

The `coverage` job runs `npm run coverage` and `make -C backend coverage` and uploads every `lcov.info`,
`coverage.xml`, `coverage.json` and `coverage-summary.json` it finds under a `coverage/` directory (each frontend
package's, and `backend/coverage/`). The thresholds are the scripts' own (vitest's `coverage.thresholds`
and pytest's `--cov-fail-under`), so the job fails when they do and CI carries no second copy of the numbers. On a
branch without the scripts the steps are skipped and the job stays green. Codecov is not wired: it would need a token
and adds nothing the artifact does not already say.

## Security checks

- **Dependency audits**: `npm run audit:security` (`npm audit --audit-level=moderate` and `pip-audit` on exactly the
  versions in `uv.lock`).
- **Secret scan**: gitleaks over the whole history, from the image pinned by digest. The GitHub action wrapper needs a
  licence for organisation repositories; the image does not. GitHub's own secret scanning and push protection are
  repository settings, enabled with the commands below; they complement the scan rather than replace it.
- **Bandit** on `backend/apps` and `backend/libs` at medium severity and up. A finding that is a false positive is
  marked `# nosec Bxxx` with the reason on the line above, never silenced globally.
- **Dependency review** on pull requests: fails on a new dependency with a moderate or worse advisory. It carries no
  licence policy: that is the owner's decision, and LGPL in particular is common in this stack. To add one later,
  give the step a `deny-licenses` (or `allow-licenses`) list of SPDX ids, for example
  `deny-licenses: AGPL-3.0, GPL-3.0`, and check the first run against what `npm ls` and `uv tree` already pull in.
- **CodeQL** in its own workflow, so a query-pack update never blocks a PR on unrelated code.
- **Dynamic smoke**: `npm run security:dynamic` against a running API (security headers, OpenAPI reachability, CORS).
- **SBOM** on every tag, CycloneDX JSON, attached to the release draft.

## Branch protection

These are repository settings, not code. Today `main` has no protection: squash is the only merge method and merged
branches are deleted, but nothing requires the checks. The following applies the expected policy. Run them from a
clone with `gh` logged in as an administrator; none of them has been run yet.

One required status check: `Gate`, the CI job that is green only when every other CI job is green or legitimately
skipped. CodeQL runs in its own workflow and reports to the Security tab; it is deliberately not required, so a
query-pack update never blocks a PR on unrelated code. To require it later, add `Analyze (javascript-typescript)` and
`Analyze (python)` to `contexts`.

```bash
repo=ISIR-EXTENDER/bloom

# Protect main: the checks, one review, linear history, no force-push, no deletion, admins included.
gh api -X PUT "repos/${repo}/branches/main/protection" --input - <<'EOF'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["Gate"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "required_approving_review_count": 1
  },
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true
}
EOF

# Squash only, PR title as the subject, branches deleted on merge, "Update branch" offered.
gh api -X PATCH "repos/${repo}" \
  -F allow_squash_merge=true -F allow_merge_commit=false -F allow_rebase_merge=false \
  -f squash_merge_commit_title=PR_TITLE -f squash_merge_commit_message=PR_BODY \
  -F delete_branch_on_merge=true -F allow_update_branch=true

# Secret scanning, push protection, Dependabot alerts and security updates.
gh api -X PATCH "repos/${repo}" --input - <<'EOF'
{
  "security_and_analysis": {
    "secret_scanning": {"status": "enabled"},
    "secret_scanning_push_protection": {"status": "enabled"},
    "secret_scanning_non_provider_patterns": {"status": "enabled"}
  }
}
EOF
gh api -X PUT "repos/${repo}/vulnerability-alerts"
gh api -X PUT "repos/${repo}/automated-security-fixes"
```

`required_approving_review_count` can be `0` while the team is two people; keep `strict: true` so a PR is re-run on
the current `main` before it merges. With `enforce_admins` on, the administrators wait for the checks too, which is
the point.

## The nightly simulation on a lab machine

Gazebo, the Extender workspace and `kortex_description` do not fit a GitHub-hosted runner, so
`ros-sim-nightly.yml` runs on a self-hosted one. The job only exists once the repository variable
`BLOOM_ROS_SIM_RUNNER_LABEL` names the runner label; until then every scheduled run is skipped instead of queuing for
a runner that is not there.

The workflow never runs on `pull_request`, only on the schedule and by hand. A self-hosted runner on a public
repository must never execute code from a fork, and this is what keeps it that way.

To set it up on the lab machine (Ubuntu 24.04, ROS 2 Jazzy, the workspace built, Node 24, uv, and Playwright's
Chromium installed for the runner's user):

```bash
# On the lab machine, as the user that owns the workspace: register the runner with the label.
# Settings > Actions > Runners > New self-hosted runner gives the exact download and token.
./config.sh --url https://github.com/ISIR-EXTENDER/bloom --labels ros-jazzy --unattended
sudo ./svc.sh install && sudo ./svc.sh start

# From a clone, as an administrator: turn the job on and tell it where the workspace is.
gh variable set BLOOM_ROS_SIM_RUNNER_LABEL --body ros-jazzy
gh variable set EXTENDER_WORKSPACE --body /home/lab/workspace/extender/extender_workspace
```

The job runs `scripts/ros-sim-nightly.sh`, which calls `scripts/ros-sim-e2e.sh --robot explorer` and then
`--robot kinova`, keeps both results, writes a pass/fail table to the job summary and uploads every capture and log
for seven days. `workflow_dispatch` takes a `robot` input to drive one arm. The Explorer's two launch workarounds and
what simulation does not prove are in [validation/ros-sim-e2e.md](validation/ros-sim-e2e.md).

## Running the checks locally

`npm run verify` runs what CI runs, in CI's order. The workflow files themselves are linted with
[actionlint](https://github.com/rhysd/actionlint):

```bash
curl -sSL https://github.com/rhysd/actionlint/releases/download/v1.7.12/actionlint_1.7.12_linux_amd64.tar.gz \
  | tar xz actionlint && ./actionlint -no-color .github/workflows/*.yml
```
