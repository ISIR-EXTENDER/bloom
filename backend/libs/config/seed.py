"""Shared application bundles that ship with the repository.

Bloom's configurations live in `backend/data/`, which is gitignored: it is a
machine's own runtime state, and it is where the builder writes. That directory
was ignored as scratch space for manual smoke tests, and nothing replaced it as
a way to share apps, so a fresh clone came up with almost nothing in it. A
colleague who cloned the repo, followed the README and launched the demo got a
single camera screen.

`backend/seed/applications/` holds the committed bundles instead: one file per
configuration, named for its id. They are seeded into whichever store is
configured the first time it comes up without them.

Seeding never overwrites. An id already present in the store belongs to whoever
is working on this machine -- their screen layouts, their edits -- and silently
replacing that with the committed version would throw away real work. Resetting
is a separate, deliberate act (`bloom config seed --force`).
"""

from dataclasses import dataclass
from pathlib import Path

from libs.config.json_io import load_configuration_file
from libs.config.repository import ConfigurationRepository

DEFAULT_SEED_DIR = Path(__file__).resolve().parents[2] / "seed" / "applications"


@dataclass(frozen=True)
class SeedOutcome:
    """What a seeding run did, so callers can report it rather than guess."""

    imported: tuple[str, ...]
    skipped: tuple[str, ...]

    @property
    def changed(self) -> bool:
        return bool(self.imported)


def available_seed_ids(seed_dir: Path | str = DEFAULT_SEED_DIR) -> list[str]:
    directory = Path(seed_dir)
    if not directory.is_dir():
        return []
    return sorted(path.stem for path in directory.glob("*.json") if path.is_file())


def seed_configurations(
    repository: ConfigurationRepository,
    *,
    seed_dir: Path | str = DEFAULT_SEED_DIR,
    force_ids: frozenset[str] | set[str] | None = None,
) -> SeedOutcome:
    """Import shipped bundles that the store does not already have.

    `force_ids` re-imports those ids even when present, which is how someone
    deliberately resets an app back to the committed version.
    """

    directory = Path(seed_dir)
    forced = frozenset(force_ids or ())
    existing = set(repository.list_ids())

    imported: list[str] = []
    skipped: list[str] = []
    for config_id in available_seed_ids(directory):
        if config_id in existing and config_id not in forced:
            skipped.append(config_id)
            continue
        repository.upsert(config_id, load_configuration_file(directory / f"{config_id}.json"))
        imported.append(config_id)

    return SeedOutcome(imported=tuple(imported), skipped=tuple(skipped))
