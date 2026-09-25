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
stale copy "edited". A copy seeded before stamps existed is recognized by
matching one of the shipped versions recorded in
`seed/unstamped-shipped-fingerprints.json`.
"""

import hashlib
import json
import logging
from dataclasses import dataclass
from functools import cache
from pathlib import Path
from typing import Literal

from libs.config.json_io import configuration_to_dict, load_configuration_file, save_configuration_file
from libs.config.models import ConfigurationBundle
from libs.config.repository import ConfigurationRepository

DEFAULT_SEED_DIR = Path(__file__).resolve().parents[2] / "seed" / "applications"
# Fingerprints of every shipped version from before seeded copies were stamped.
UNSTAMPED_SHIPPED_FINGERPRINTS_PATH = DEFAULT_SEED_DIR.parent / "unstamped-shipped-fingerprints.json"

logger = logging.getLogger(__name__)


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
    """Content hash of authored values, ignoring the stamp itself and when it was exported.

    Defaults are left out, so a new model field does not make every stored copy look edited.
    """
    return _fingerprint(bundle.model_dump(mode="json", exclude_defaults=True))


def _full_dump_fingerprint(bundle: ConfigurationBundle) -> str:
    # How stamps were computed before defaults were excluded; those stamps are still honoured.
    return _fingerprint(configuration_to_dict(bundle))


def _fingerprint(payload: dict) -> str:
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


def is_unedited_seed_copy(stored: ConfigurationBundle, config_id: str = "") -> bool:
    stamp = stored.metadata.seed_fingerprint
    if stamp:
        return stamp in (configuration_fingerprint(stored), _full_dump_fingerprint(stored))
    # Seeded before stamps existed: unedited if it matches any version ever shipped.
    return configuration_fingerprint(stored) in _unstamped_shipped_fingerprints().get(config_id, ())


@cache
def _unstamped_shipped_fingerprints() -> dict[str, tuple[str, ...]]:
    try:
        recorded = json.loads(UNSTAMPED_SHIPPED_FINGERPRINTS_PATH.read_text())
    except (OSError, ValueError):
        return {}
    return {config_id: tuple(fingerprints) for config_id, fingerprints in recorded.items()}


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
    deleted = set(repository.deleted_ids())

    imported: list[str] = []
    skipped: list[str] = []
    upgraded: list[str] = []
    for config_id in available_seed_ids(directory):
        if config_id in deleted and config_id not in forced:
            skipped.append(config_id)
            continue
        shipped = stamp_seed_fingerprint(load_configuration_file(directory / f"{config_id}.json"))
        if config_id not in existing or config_id in forced:
            repository.upsert(config_id, shipped)
            imported.append(config_id)
            continue

        try:
            stored = repository.get(config_id)
        except Exception:
            # One unreadable bundle must not keep the API, and every other app, from starting.
            logger.exception("Stored configuration %s could not be read; leaving it untouched.", config_id)
            skipped.append(config_id)
            continue
        if not is_unedited_seed_copy(stored, config_id):
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


#: Where a stored app stands against the shipped one, as `bloom config status` and the Builder show it.
ShareStatus = Literal["deleted", "edited", "local", "missing", "outdated", "shared"]


def configuration_share_status(
    repository: ConfigurationRepository, seed_dir: Path | str = DEFAULT_SEED_DIR
) -> dict[str, ShareStatus]:
    stored = set(repository.list_ids())
    shipped = set(available_seed_ids(seed_dir))
    deleted = set(repository.deleted_ids())
    statuses: dict[str, ShareStatus] = {}
    for config_id in sorted(stored | shipped):
        if config_id not in stored:
            statuses[config_id] = "deleted" if config_id in deleted else "missing"
        elif config_id not in shipped:
            statuses[config_id] = "local"
        else:
            stored_bundle = repository.get(config_id)
            shipped_bundle = load_configuration_file(Path(seed_dir) / f"{config_id}.json")
            # Compare content, not the stamp: a seeded copy carries a fingerprint the shipped file does not.
            if configuration_fingerprint(stored_bundle) == configuration_fingerprint(shipped_bundle):
                statuses[config_id] = "shared"
            elif is_unedited_seed_copy(stored_bundle, config_id):
                statuses[config_id] = "outdated"
            else:
                statuses[config_id] = "edited"
    return statuses


def restore_shipped_configuration(
    repository: ConfigurationRepository, config_id: str, seed_dir: Path | str = DEFAULT_SEED_DIR
) -> ConfigurationBundle:
    """Replace the stored copy with the shipped one, discarding local edits. Raises FileNotFoundError."""
    source = Path(seed_dir) / f"{config_id}.json"
    if not source.is_file():
        raise FileNotFoundError(source)
    return repository.upsert(config_id, stamp_seed_fingerprint(load_configuration_file(source)))


@dataclass(frozen=True)
class PublishOutcome:
    destination: Path
    already_published: bool


def publish_configuration(
    repository: ConfigurationRepository, config_id: str, seed_dir: Path | str = DEFAULT_SEED_DIR
) -> PublishOutcome:
    """Write a stored app out as a shared one, for someone to commit. Raises ConfigurationNotFoundError."""
    bundle = repository.get(config_id)
    destination = Path(seed_dir) / f"{config_id}.json"
    # Rewriting an unchanged app would only reorder keys and spell out defaults.
    already_published = destination.is_file() and configuration_fingerprint(
        load_configuration_file(destination)
    ) == configuration_fingerprint(bundle)
    if not already_published:
        destination.parent.mkdir(parents=True, exist_ok=True)
        # The stamp records where a store copy came from; a shipped file is the source, so it carries none.
        save_configuration_file(strip_seed_fingerprint(bundle), destination)
    # Stamped only once the file is really there: a stamp claimed before a failed write let the next
    # seed run throw the operator's edits away.
    repository.upsert(config_id, stamp_seed_fingerprint(bundle))
    return PublishOutcome(destination=destination, already_published=already_published)
