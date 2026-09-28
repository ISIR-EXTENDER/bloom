"""The palette ids and their retired aliases are one table, read the same on both sides of the API (ADR 0143)."""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from libs.config.models import THEME_PRESET_ALIASES, THEME_PRESET_IDS, ApplicationTheme, UserProfile

THEME_TS = Path(__file__).resolve().parents[2] / "frontend" / "libs" / "ui" / "src" / "theme.ts"


def frontend_tables() -> tuple[set[str], dict[str, str]]:
    source = THEME_TS.read_text(encoding="utf-8")
    union = re.search(r"export type BloomThemePresetId = ([^;]+);", source)
    aliases = re.search(r"export const BLOOM_THEME_PRESET_ALIASES[^{]*\{([^}]*)\}", source)
    assert union and aliases, "theme.ts no longer declares the preset id union or the alias table"
    ids = set(re.findall(r'"([^"]+)"', union.group(1)))
    table = {
        key.strip("\"'"): value
        for key, value in re.findall(r"""\s*(["']?[\w-]+["']?):\s*"([\w-]+)",?""", aliases.group(1))
    }
    return ids, table


def test_the_backend_accepts_exactly_the_palettes_the_frontend_ships() -> None:
    ids, aliases = frontend_tables()
    assert ids == THEME_PRESET_IDS
    assert aliases == THEME_PRESET_ALIASES
    assert set(aliases.values()) <= ids
    assert not set(aliases) & ids, "an alias must never shadow a vetted id"


@pytest.mark.parametrize("stored", sorted(THEME_PRESET_ALIASES))
def test_a_retired_id_reads_as_its_replacement_on_the_app_and_on_a_role(stored: str) -> None:
    replacement = THEME_PRESET_ALIASES[stored]
    assert ApplicationTheme.model_validate({"preset_id": stored}).preset_id == replacement
    role = UserProfile.model_validate({"id": "r", "name": "R", "app_theme_preset_id": stored})
    assert role.app_theme_preset_id == ("" if stored == "bloom-default" else replacement)


@pytest.mark.parametrize("vetted", sorted(THEME_PRESET_IDS))
def test_a_vetted_id_round_trips_unchanged_through_json(vetted: str) -> None:
    theme = ApplicationTheme.model_validate({"preset_id": vetted})
    role = UserProfile.model_validate({"id": "r", "name": "R", "app_theme_preset_id": vetted})
    assert json.loads(theme.model_dump_json())["preset_id"] == vetted
    assert json.loads(role.model_dump_json())["app_theme_preset_id"] == vetted
    assert ApplicationTheme.model_validate(json.loads(theme.model_dump_json())) == theme


def test_an_id_from_a_newer_bloom_is_kept_so_the_app_still_loads() -> None:
    # The frontend resolves an id it does not know as Bloom Garden; refusing it here would lose the whole app.
    assert ApplicationTheme.model_validate({"preset_id": "aurora"}).preset_id == "aurora"
    assert UserProfile.model_validate(
        {"id": "r", "name": "R", "app_theme_preset_id": "aurora"}
    ).app_theme_preset_id == ("aurora")


def test_a_non_text_id_is_refused_rather_than_aliased() -> None:
    with pytest.raises(ValueError):
        ApplicationTheme.model_validate({"preset_id": 3})
    with pytest.raises(ValueError):
        ApplicationTheme.model_validate({"preset_id": ""})
