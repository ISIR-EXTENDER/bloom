import pytest
from pydantic import ValidationError

from libs.config.models import ApplicationConfig


def test_an_application_is_active_by_default() -> None:
    # A configuration written before archiving existed describes an app still
    # being carried forward.
    assert ApplicationConfig(id="a", name="A").lifecycle == "active"


def test_an_application_can_be_archived() -> None:
    assert ApplicationConfig(id="a", name="A", lifecycle="archived").lifecycle == "archived"


def test_an_unknown_lifecycle_is_rejected() -> None:
    # Silently accepting a typo would let an app be neither gated nor labelled.
    with pytest.raises(ValidationError):
        ApplicationConfig(id="a", name="A", lifecycle="retired")


def test_archiving_does_not_change_anything_else() -> None:
    active = ApplicationConfig(id="a", name="A")
    archived = ApplicationConfig(id="a", name="A", lifecycle="archived")

    assert archived.model_dump(exclude={"lifecycle"}) == active.model_dump(exclude={"lifecycle"})


def test_the_petanque_fixture_is_archived() -> None:
    # Petanque is kept and runnable, but not maintained against the
    # cartesian_manager architecture.
    import json
    from pathlib import Path

    bundle = json.loads((Path(__file__).parents[1] / "seed" / "applications" / "petanque-admin.json").read_text())
    applications = [ApplicationConfig.model_validate(app) for app in bundle["applications"]]

    assert applications
    assert all(app.lifecycle == "archived" for app in applications)


def test_the_current_extender_apps_are_active() -> None:
    import json
    from pathlib import Path

    for name in ("sandbox", "explorer-manager"):
        bundle = json.loads((Path(__file__).parents[1] / "seed" / "applications" / f"{name}.json").read_text())
        for app in bundle["applications"]:
            assert ApplicationConfig.model_validate(app).lifecycle == "active", name
