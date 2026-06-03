from dataclasses import dataclass

from libs.config.models import ApplicationConfig, ConfigurationBundle, ScreenConfig


class ConfigurationEditError(ValueError):
    pass


class ApplicationNotFoundError(ConfigurationEditError):
    pass


class ScreenNotFoundError(ConfigurationEditError):
    pass


@dataclass(frozen=True)
class ReusableScreen:
    screen: ScreenConfig
    source_application_id: str
    source_application_name: str


def upsert_application(bundle: ConfigurationBundle, application: ApplicationConfig) -> ConfigurationBundle:
    application_was_updated = False
    applications: list[ApplicationConfig] = []

    for candidate_application in bundle.applications:
        if candidate_application.id != application.id:
            applications.append(candidate_application)
            continue

        application_was_updated = True
        applications.append(application)

    if not application_was_updated:
        applications.append(application)

    return bundle.model_copy(update={"applications": tuple(applications)})


def delete_application(bundle: ConfigurationBundle, application_id: str) -> ConfigurationBundle:
    applications = tuple(application for application in bundle.applications if application.id != application_id)

    if len(applications) == len(bundle.applications):
        raise ApplicationNotFoundError(f'Application "{application_id}" was not found in the selected configuration.')

    return bundle.model_copy(update={"applications": applications})


def upsert_screen(bundle: ConfigurationBundle, application_id: str, screen: ScreenConfig) -> ConfigurationBundle:
    applications: list[ApplicationConfig] = []
    application_was_updated = False

    for application in bundle.applications:
        if application.id != application_id:
            applications.append(application)
            continue

        application_was_updated = True
        screen_was_updated = False
        screens: list[ScreenConfig] = []

        for candidate_screen in application.screens:
            if candidate_screen.id != screen.id:
                screens.append(candidate_screen)
                continue

            screen_was_updated = True
            screens.append(screen)

        if not screen_was_updated:
            screens.append(screen)

        applications.append(application.model_copy(update={"screens": tuple(screens)}))

    if not application_was_updated:
        raise ApplicationNotFoundError(f'Application "{application_id}" was not found in the selected configuration.')

    return bundle.model_copy(update={"applications": tuple(applications)})


def delete_screen(bundle: ConfigurationBundle, application_id: str, screen_id: str) -> ConfigurationBundle:
    applications: list[ApplicationConfig] = []
    application_was_updated = False
    screen_was_deleted = False

    for application in bundle.applications:
        if application.id != application_id:
            applications.append(application)
            continue

        application_was_updated = True

        if len(application.screens) <= 1:
            raise ConfigurationEditError(f'Application "{application_id}" must keep at least one screen.')

        screens = tuple(screen for screen in application.screens if screen.id != screen_id)
        screen_was_deleted = len(screens) != len(application.screens)
        applications.append(application.model_copy(update={"screens": screens}))

    if not application_was_updated:
        raise ApplicationNotFoundError(f'Application "{application_id}" was not found in the selected configuration.')

    if not screen_was_deleted:
        raise ScreenNotFoundError(f'Screen "{screen_id}" was not found in application "{application_id}".')

    return bundle.model_copy(update={"applications": tuple(applications)})


def list_reusable_screens(bundle: ConfigurationBundle) -> tuple[ReusableScreen, ...]:
    screens_by_id: dict[str, ReusableScreen] = {}

    for application in bundle.applications:
        for screen in application.screens:
            screens_by_id.setdefault(
                screen.id,
                ReusableScreen(
                    screen=screen,
                    source_application_id=application.id,
                    source_application_name=application.name,
                ),
            )

    return tuple(screens_by_id.values())
