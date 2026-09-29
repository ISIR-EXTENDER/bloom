"""Theme asset uploads are decoded and bounded; files are served and cleaned only from the asset directory."""

from __future__ import annotations

import base64
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from apps.bloom_api.main import create_app
from apps.bloom_api.routes.theme_assets import (
    MAX_THEME_ASSET_BYTES,
    collect_theme_asset_uris,
    delete_theme_asset_file,
    resolve_theme_asset_filename,
)
from apps.bloom_api.settings import Settings
from libs.config import ConfigurationBundle

ASSETS = "/api/v1/configurations/sandbox/theme-assets"
APPLICATION = "/api/v1/configurations/sandbox/applications/sandbox"


def file_store_client(tmp_path: Path, bundle: ConfigurationBundle) -> TestClient:
    settings = Settings(
        environment="test",
        configuration_storage="file",
        configuration_dir=tmp_path / "configurations",
        theme_asset_dir=tmp_path / "theme-assets",
    )
    client = TestClient(create_app(settings))
    assert client.put("/api/v1/configurations/sandbox", json=bundle.model_dump(mode="json")).status_code == 200
    return client


def upload(client: TestClient, filename: str = "board.png", content: bytes = b"png", content_base64: str | None = None):
    encoded = content_base64 if content_base64 is not None else base64.b64encode(content).decode("ascii")
    return client.post(ASSETS, json={"filename": filename, "content_type": "image/png", "content_base64": encoded})


def set_moodboard(client: TestClient, uri: str) -> None:
    application = client.get("/api/v1/configurations/sandbox").json()["applications"][0]
    application["theme"]["inspiration"]["moodboard_image_uri"] = uri
    assert client.put(APPLICATION, json=application).status_code == 200


@pytest.mark.parametrize(
    ("body", "detail"),
    [
        ({"content_base64": "not*base64!"}, "invalid theme asset encoding"),
        ({"content": b"x" * (MAX_THEME_ASSET_BYTES + 1)}, "theme asset is too large"),
        ({"content": b""}, "theme asset is empty"),
    ],
)
def test_a_bad_upload_is_refused_and_nothing_is_written(
    tmp_path: Path, sample_configuration_bundle: ConfigurationBundle, body: dict, detail: str
) -> None:
    client = file_store_client(tmp_path, sample_configuration_bundle)

    response = upload(client, **body)

    assert response.status_code == 400
    assert response.json() == {"detail": detail}
    assert not (tmp_path / "theme-assets").exists()


def test_a_missing_or_non_image_file_is_not_served(tmp_path: Path, sample_configuration_bundle) -> None:
    client = file_store_client(tmp_path, sample_configuration_bundle)
    asset_dir = tmp_path / "theme-assets"
    asset_dir.mkdir()
    (asset_dir / "notes.txt").write_text("private")

    assert client.get(f"{ASSETS}/missing.png").status_code == 404
    assert client.get(f"{ASSETS}/notes.txt").status_code == 404


def test_on_file_storage_a_replaced_moodboard_is_removed_without_a_ledger(
    tmp_path: Path, sample_configuration_bundle: ConfigurationBundle
) -> None:
    client = file_store_client(tmp_path, sample_configuration_bundle)
    first = upload(client, "first.png", b"first").json()["uri"]
    second = upload(client, "second.png", b"second").json()["uri"]
    assert client.get(first).content == b"first"

    set_moodboard(client, first)
    set_moodboard(client, second)

    assert client.get(first).status_code == 404
    assert client.get(second).content == b"second"
    # File storage keeps no SQLite ledger, and the default database path was never touched.
    assert not (tmp_path / "data").exists()


def test_a_moodboard_hosted_elsewhere_is_left_alone_when_replaced(
    tmp_path: Path, sample_configuration_bundle: ConfigurationBundle
) -> None:
    client = file_store_client(tmp_path, sample_configuration_bundle)
    kept = upload(client, "kept.png", b"kept").json()["uri"]

    set_moodboard(client, "https://example.com/board.png")
    set_moodboard(client, "")

    assert (
        client.get("/api/v1/configurations/sandbox").json()["applications"][0]["theme"]["inspiration"][
            "moodboard_image_uri"
        ]
        == ""
    )
    assert client.get(kept).content == b"kept"


def test_only_this_configurations_asset_names_resolve_to_a_file() -> None:
    assert resolve_theme_asset_filename("sandbox", f"{ASSETS}/sandbox-board-0123.png") == "sandbox-board-0123.png"
    assert resolve_theme_asset_filename("sandbox", f"{ASSETS}/mood%20board.webp") == "mood board.webp"
    assert resolve_theme_asset_filename("sandbox", "/api/v1/configurations/other/theme-assets/x.png") is None
    assert resolve_theme_asset_filename("sandbox", "https://example.com/board.png") is None
    for name in ("", ".", "..", "../x.png", "..%2F..%2Fsecret.png", "sub/x.png", "a\\b.png", "notes.txt"):
        assert resolve_theme_asset_filename("sandbox", f"{ASSETS}/{name}") is None, name


def test_a_cleanup_never_deletes_outside_the_asset_directory(tmp_path: Path) -> None:
    asset_dir = tmp_path / "assets"
    asset_dir.mkdir()
    outside = tmp_path / "secret.png"
    outside.write_bytes(b"secret")
    inside = asset_dir / "board.png"
    inside.write_bytes(b"board")

    delete_theme_asset_file(asset_dir, "../secret.png")
    delete_theme_asset_file(asset_dir, "board.png")
    delete_theme_asset_file(asset_dir, "already-gone.png")

    assert outside.exists()
    assert not inside.exists()


def test_no_bundle_references_no_assets() -> None:
    assert collect_theme_asset_uris(None) == set()
