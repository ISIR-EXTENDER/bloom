# 0122 - Shared application bundles

Date: 2026-09-02

## Context

A colleague cloned Bloom, followed the README, and launched the demo with no
robot. It worked, and he saw one camera screen. Explorer Manager, Sandbox V0.0,
Explorer User Tests and Petanque were nowhere.

They live in `backend/data/`, which `0962c8d` added to `.gitignore` as "local
backend data created during manual smoke tests". That was correct — it is a
machine's own runtime state, and the builder writes to it — but nothing replaced
it as a way to share apps. Exactly one configuration stayed tracked,
`webcam-visualizer.json`, and only because it predated the ignore rule.

The bundles were in git the whole time, as `tests/fixtures/*.json`. Nothing
loaded them into a running backend: there was no seeding code anywhere. The
coherence check compared fixture against local file with the direction of truth
backwards, treating a committed fixture as a mirror of somebody's ignored local
file, and skipping entirely when that file was absent.

So sharing had quietly reverted to "ask Susana for her JSON".

## Decision

Committed JSON bundles are the source of truth for shared applications. They
live in `backend/seed/applications/`, one file per configuration id, and the API
imports the ones a store is missing when it starts.

`tests/fixtures/` keeps only what is genuinely test input. The app bundles moved
out of it rather than being copied, so there is one shared artifact, not two that
drift.

**Seeding never overwrites.** An id already in the store holds this machine's own
screen layouts and edits, and replacing that silently would throw away real work.
Resetting is a separate, deliberate act.

```bash
bloom config seed                          # import what is missing
bloom config seed --force explorer-manager # reset one app
bloom config publish explorer-manager      # share your version
bloom config status                        # what have I not shared yet
```

`publish` closes the loop: it is how an app built in the builder becomes one the
team gets on clone. It round-trips byte for byte, so committing what it writes
produces a diff of the change and nothing else. That required normalising the
committed bundles once through the same writer, and excluding the directory from
Biome, which would otherwise reformat what the backend had just written.

## Consequences

- A fresh clone comes up with the same app library everyone else has. Verified by
  cloning into an empty directory and booting the API.
- The coherence check stops failing on local edits. It went red the moment anyone
  moved a widget in the builder, which taught everyone to ignore it. "What have I
  not published" moved to `config status`, which reads the real store.
- `scripts/extender-validation-preflight.sh` no longer hand-copies three
  fixtures; it seeds, so it covers every shipped app.
- Publishing is a deliberate act. An app someone edits stays local until they run
  `config publish`, which is the intended tradeoff: the repository holds what the
  team agreed to share, not whatever anyone last touched.

## Alternatives considered

**Export and import by hand in the UI.** Keeps the store as the only source of
truth and adds buttons producing a file. Rejected because a fresh clone still
starts empty, which is the actual problem.

**A shared backend in the lab.** One store everyone points at. Rejected: it needs
the server up and reachable, and there is no offline story for a laptop at a
demo.
