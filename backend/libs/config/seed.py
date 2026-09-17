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

Seeding never overwrites an edited bundle. An id already present in the store
belongs to whoever is working on this machine -- their screen layouts, their
edits -- and silently replacing that with the committed version would throw away
real work. Resetting is a separate, deliberate act (`bloom config seed --force`).

An *unedited* copy is different. Bloom stamps each seeded bundle with the
fingerprint of the shipped file it came from, so a store copy that still matches
that fingerprint is known to be nobody's work, and a newer shipped version
replaces it. Without that, an installation seeded once kept the app it first saw
forever: screens added upstream never arrived, and `config status` called the
stale copy "edited".
"""

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path

from libs.config.json_io import configuration_to_dict, load_configuration_file
from libs.config.models import ConfigurationBundle
from libs.config.repository import ConfigurationRepository

DEFAULT_SEED_DIR = Path(__file__).resolve().parents[2] / "seed" / "applications"


@dataclass(frozen=True)
class SeedOutcome:
    """What a seeding run did, so callers can report it rather than guess."""

    imported: tuple[str, ...]
    skipped: tuple[str, ...]
    upgraded: tuple[str, ...] = ()

    @property
    def changed(self) -> bool:
        return bool(self.imported or self.upgraded)


def configuration_fingerprint(bundle: ConfigurationBundle) -> str:
    """Content hash, ignoring the stamp itself and when it was exported."""
    payload = configuration_to_dict(bundle)
    metadata = payload.get("metadata")
    if isinstance(metadata, dict):
        metadata = {key: value for key, value in metadata.items() if key not in ("exported_at", "seed_fingerprint")}
        payload = {**payload, "metadata": metadata}
    return hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()


def stamp_seed_fingerprint(bundle: ConfigurationBundle) -> ConfigurationBundle:
    return bundle.model_copy(
        update={"metadata": bundle.metadata.model_copy(update={"seed_fingerprint": configuration_fingerprint(bundle)})}
    )


def strip_seed_fingerprint(bundle: ConfigurationBundle) -> ConfigurationBundle:
    return bundle.model_copy(update={"metadata": bundle.metadata.model_copy(update={"seed_fingerprint": ""})})


def is_unedited_seed_copy(stored: ConfigurationBundle) -> bool:
    stamp = stored.metadata.seed_fingerprint
    return bool(stamp) and stamp == configuration_fingerprint(stored)


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
    upgraded: list[str] = []
    for config_id in available_seed_ids(directory):
        shipped = stamp_seed_fingerprint(load_configuration_file(directory / f"{config_id}.json"))
        if config_id not in existing or config_id in forced:
            repository.upsert(config_id, shipped)
            imported.append(config_id)
            continue

        stored = repository.get(config_id)
        if not is_unedited_seed_copy(stored):
            skipped.append(config_id)
            continue
        if stored.metadata.seed_fingerprint == shipped.metadata.seed_fingerprint:
            skipped.append(config_id)
            continue

        # Nobody has touched this copy, and the shipped one moved on.
        repository.upsert(config_id, shipped)
        upgraded.append(config_id)

    return SeedOutcome(imported=tuple(imported), skipped=tuple(skipped), upgraded=tuple(upgraded))


def adopt_file_configurations(
    repository: ConfigurationRepository,
    *,
    configuration_dir: Path | str,
) -> tuple[str, ...]:
    """Carry an existing JSON store into an empty one, once.

    File storage was the default for a long time, so most machines have real
    work sitting in `backend/data/configurations`: screens people rearranged,
    apps they built. Switching the default to SQLite without this would leave
    all of it behind on disk, present but invisible, and the builder would look
    like it had been reset.

    Only an empty target is adopted into. Once the store has anything in it,
    it is the source of truth and the JSON files are history.
    """

    if repository.list_ids():
        return ()

    source_dir = Path(configuration_dir)
    if not source_dir.is_dir():
        return ()

    adopted: list[str] = []
    for path in sorted(source_dir.glob("*.json")):
        repository.upsert(path.stem, load_configuration_file(path))
        adopted.append(path.stem)
    return tuple(adopted)
