import base64
import hashlib
import re
from pathlib import Path
from urllib.parse import unquote

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import FileResponse
from pydantic import BaseModel

from apps.bloom_api.routes.configuration_bundles import get_configuration_bundle
from apps.bloom_api.security import BloomPrincipal, require_admin, require_observer
from libs.config import ConfigurationBundle
from libs.db.sqlite import sqlite_connection

router = APIRouter(prefix="/{config_id}/theme-assets")

MAX_THEME_ASSET_BYTES = 1_000_000
ALLOWED_THEME_ASSET_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


class ThemeAssetUploadRequest(BaseModel):
    filename: str
    content_type: str
    content_base64: str


class ThemeAssetUploadResponse(BaseModel):
    uri: str
    content_type: str
    byte_size: int


@router.post("", response_model=ThemeAssetUploadResponse)
def upload_theme_asset(
    config_id: str,
    upload: ThemeAssetUploadRequest,
    request: Request,
    _principal: BloomPrincipal = Depends(require_admin),
) -> ThemeAssetUploadResponse:
    get_configuration_bundle(config_id, request)

    content = decode_theme_asset(upload)
    safe_extension = ALLOWED_THEME_ASSET_TYPES[upload.content_type]
    asset_digest = hashlib.sha256(content).hexdigest()[:16]
    safe_stem = slugify_asset_name(upload.filename) or "theme-asset"
    asset_filename = f"{config_id}-{safe_stem}-{asset_digest}{safe_extension}"
    asset_dir = request.app.state.settings.theme_asset_dir
    asset_dir.mkdir(parents=True, exist_ok=True)
    asset_path = asset_dir / asset_filename
    asset_path.write_bytes(content)
    asset_uri = f"{request.app.state.settings.api_prefix}/configurations/{config_id}/theme-assets/{asset_filename}"
    # Keyed by configuration as well as content: the same picture uploaded to two apps has two uris and
    # two files, and a ledger keyed on content alone kept one row and lost track of the other file.
    register_theme_asset_if_sqlite(
        request,
        f"{config_id}:{asset_digest}",
        asset_uri,
        asset_filename,
        upload.content_type,
        len(content),
    )

    return ThemeAssetUploadResponse(
        uri=asset_uri,
        content_type=upload.content_type,
        byte_size=len(content),
    )


@router.get("/{asset_filename}")
def get_theme_asset(
    config_id: str,
    asset_filename: str,
    request: Request,
    _principal: BloomPrincipal = Depends(require_observer),
) -> FileResponse:
    get_configuration_bundle(config_id, request)

    asset_dir = request.app.state.settings.theme_asset_dir.resolve()
    asset_path = (asset_dir / asset_filename).resolve()
    if asset_dir not in asset_path.parents or not asset_path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="theme asset not found")

    content_type = resolve_asset_content_type(asset_filename)
    if content_type is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="theme asset not found")

    return FileResponse(asset_path, media_type=content_type)


def decode_theme_asset(upload: ThemeAssetUploadRequest) -> bytes:
    if upload.content_type not in ALLOWED_THEME_ASSET_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="unsupported theme asset type")

    try:
        content = base64.b64decode(upload.content_base64, validate=True)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid theme asset encoding") from exc

    if len(content) > MAX_THEME_ASSET_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="theme asset is too large")

    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="theme asset is empty")

    return content


def slugify_asset_name(filename: str) -> str:
    stem = filename.rsplit(".", maxsplit=1)[0]
    return re.sub(r"[^a-z0-9]+", "-", stem.lower()).strip("-")


def resolve_asset_content_type(asset_filename: str) -> str | None:
    for content_type, extension in ALLOWED_THEME_ASSET_TYPES.items():
        if asset_filename.endswith(extension):
            return content_type
    return None


def register_theme_asset_if_sqlite(
    request: Request,
    asset_id: str,
    uri: str,
    filename: str,
    content_type: str,
    byte_size: int,
) -> None:
    settings = request.app.state.settings
    if settings.configuration_storage != "sqlite":
        return

    # The repository migrated at startup; migrating again here only opened a write transaction.
    with sqlite_connection(settings.configuration_database_path) as connection:
        connection.execute(
            """
            INSERT INTO theme_assets (asset_id, uri, filename, content_type, byte_size)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(asset_id) DO UPDATE SET
                uri = excluded.uri,
                filename = excluded.filename,
                content_type = excluded.content_type,
                byte_size = excluded.byte_size
            """,
            (asset_id, uri, filename, content_type, byte_size),
        )
        connection.commit()


def cleanup_unreferenced_theme_assets(
    config_id: str,
    previous_bundle: ConfigurationBundle | None,
    updated_bundle: ConfigurationBundle | None,
    request: Request,
) -> None:
    if previous_bundle is None:
        return

    previous_uris = collect_theme_asset_uris(previous_bundle)
    current_uris = collect_theme_asset_uris(updated_bundle) if updated_bundle is not None else set()
    removable_uris = previous_uris - current_uris
    if not removable_uris:
        return

    asset_dir = request.app.state.settings.theme_asset_dir
    for uri in removable_uris:
        asset_filename = resolve_theme_asset_filename(config_id, uri)
        if not asset_filename:
            continue
        delete_theme_asset_file(asset_dir, asset_filename)
        unregister_theme_asset_if_sqlite(request, uri)


def collect_theme_asset_uris(bundle: ConfigurationBundle | None) -> set[str]:
    if bundle is None:
        return set()
    return {
        application.theme.inspiration.moodboard_image_uri
        for application in bundle.applications
        if application.theme.inspiration.moodboard_image_uri
    }


def resolve_theme_asset_filename(config_id: str, uri: str) -> str | None:
    marker = f"/configurations/{config_id}/theme-assets/"
    if marker not in uri:
        return None
    filename = unquote(uri.rsplit(marker, maxsplit=1)[-1])
    if not filename or "/" in filename or "\\" in filename or filename in {".", ".."}:
        return None
    if resolve_asset_content_type(filename) is None:
        return None
    return filename


def delete_theme_asset_file(asset_dir: Path, asset_filename: str) -> None:
    resolved_asset_dir = asset_dir.resolve()
    asset_path = (resolved_asset_dir / asset_filename).resolve()
    if resolved_asset_dir not in asset_path.parents:
        return
    asset_path.unlink(missing_ok=True)


def unregister_theme_asset_if_sqlite(request: Request, uri: str) -> None:
    settings = request.app.state.settings
    if settings.configuration_storage != "sqlite":
        return

    # The repository migrated at startup; migrating again here only opened a write transaction.
    with sqlite_connection(settings.configuration_database_path) as connection:
        connection.execute("DELETE FROM theme_assets WHERE uri = ?", (uri,))
        connection.commit()
