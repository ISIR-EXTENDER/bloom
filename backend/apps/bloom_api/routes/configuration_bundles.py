from fastapi import HTTPException, Request, status

from libs.config import (
    ConfigurationBundle,
    ConfigurationNotFoundError,
    ConfigurationRepository,
    ConfigurationUnreadableError,
)


def get_configuration_repository(request: Request) -> ConfigurationRepository:
    return request.app.state.configuration_repository


def get_configuration_bundle(config_id: str, request: Request) -> ConfigurationBundle:
    repository = get_configuration_repository(request)
    try:
        return repository.get(config_id)
    # A stored bundle this build cannot reconstruct is a version mismatch, not a missing app, and it is
    # worth saying so: the listing still shows it, so the Builder offers an app that will not open.
    except ConfigurationUnreadableError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    # Both repositories raise a plain ValueError for an id they refuse, so an id the traversal guard
    # rejected answered 500 as though Bloom had broken rather than as though the id was wrong.
    except (ConfigurationNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="configuration not found") from exc


def try_get_configuration_bundle(config_id: str, request: Request) -> ConfigurationBundle | None:
    try:
        return get_configuration_repository(request).get(config_id)
    except (ConfigurationNotFoundError, ValueError):
        return None
