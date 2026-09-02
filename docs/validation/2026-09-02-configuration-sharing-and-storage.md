# 2026-09-02 Configuration sharing and storage

Status: **accepted**. Verified on a clean tree with no robot attached.

## Why

Robin cloned Bloom, followed the README, and launched the demo without a robot.
It ran. He then had two screens and a blue design that nobody here uses.

Both symptoms only appear on a fresh clone, which is why neither had been
noticed: everyone working on Bloom already had the apps sitting in their own
untracked `backend/data/`, and a per-app theme that overrode the default.

## What was actually wrong

**Sharing had reverted to passing JSON around by hand.** `0962c8d` added
`backend/data/` to `.gitignore` as "local backend data created during manual
smoke tests". Correct in itself — it is a machine's runtime state — but nothing
replaced it as a way to share apps. One configuration stayed tracked, a
single-screen camera demo, and only because it predated the ignore rule. The app
bundles were in git as `tests/fixtures/*.json` the whole time, and no code path
loaded them into a running backend.

**The database was never adopted.** `0035` chose SQLite in June and kept file
storage "while parity is verified". Parity was never verified and nothing
migrated, so `configuration_storage` still defaulted to `file` and
`backend/data/bloom.db` did not exist on any machine.

**The theme default was changed and never changed back.** `89e4467` set the
provider default to the blue Extender UI preset. What looked like a settled
choice of the cream palette was only the `preset_id` in local, untracked files.
Four defaults disagreed: the provider, the `App.tsx` fallback, the api-client
constant, and the backend model. The fallback is the one that bites, because it
applies whenever configuration is not ready — including while the backend is
unreachable.

## Two bugs found by switching the default to SQLite

Both were latent for as long as the database went unused.

**The normalized mirror silently dropped `lifecycle`.** SQLite keeps the
canonical bundle JSON and a mirror in normalized rows; reads rebuild from the
rows. `lifecycle` arrived with `0121` and the mirror never learned about it, so
any bundle through SQLite came back with its applications `active`. Petanque
would have un-archived itself on the first save, undoing `0121` without an error
anywhere.

**The test suite wrote into the developer's own store.** `configuration_dir` and
`configuration_database_path` are relative, resolved from the working directory,
which during a test run is `backend/`. Any test built from bare defaults wrote
into real data. A run had already left a `play-petanque` configuration behind and
replaced `sandbox` with a test fixture on this machine.

Both fixes are the general form rather than the specific one: a test that
round-trips *every* shipped bundle, and a working directory that makes the real
store unreachable however a test builds its settings.

## What changed

- Shared apps moved to `backend/seed/applications/`, one file per configuration
  id, and are seeded into whichever store is configured when missing. Seeding
  never overwrites.
- `bloom config seed`, `config publish`, `config status` added. `publish`
  round-trips byte for byte.
- SQLite is the default store; an existing file-backed directory is adopted into
  an empty database on first start.
- The CLI follows the configured storage instead of hardcoding `file`.
- All four theme defaults agree on the Bloom palette.
- The coherence check no longer fails on local edits; `config status` answers
  that question against the real store.
- `scripts/extender-validation-preflight.sh` seeds instead of copying three
  fixtures by hand.

## Verification

Ran from a clean tree containing only tracked files, with an absent
`backend/data/`:

| Check | Result |
| --- | --- |
| Store on first boot | `SQLiteConfigurationRepository`, `data/bloom.db` created |
| Applications present | all six, none missing |
| Petanque lifecycle | `archived` |
| Explorer Manager theme | `bloom-default` |
| `backend/data/configurations/` | not created |

On this machine, the existing file store was adopted into SQLite with the local
Drive layout intact (`drive-translation` at 472x432, resized in the builder, not
the shipped 430x440).

Idempotence and safety:

- `config seed` twice imports nothing the second time.
- A hand-edited screen title survives a restart.
- `config seed --force explorer-manager` resets that app and leaves `sandbox`
  edited.
- Seeding verified against both `file` and `sqlite`.
- The suite no longer modifies `backend/data/bloom.db`, checked by comparing the
  file before and after a full run.

Gates, all green: Biome, `npm run build`, 406 frontend tests, 266 backend tests,
`qa:review`, `check:version`, and all six validation runners — the first time
`validation:frontend-backend` has passed in a while, because it used to fail the
moment anyone moved a widget.

## Not covered

- No robot and no ROS was attached, so this says nothing about live behaviour.
- Theme change verified by tests and by reading the resolved preset, not by a
  visual comparison on Robin's machine.
- Multi-machine flow (someone else publishing an app and this machine picking it
  up) was verified through a clean tree, not between two people.

## Open

`config status` currently reports `explorer-manager` as `edited`: the Drive
screen layout on this machine has not been published. That is a deliberate
decision to make, not a defect.
