import type { ApplicationConfig, ConfigurationBundle, ScreenConfig } from "@bloom/api-client";

export function appendApplicationToConfigurationBundle(
  bundle: ConfigurationBundle,
  application: ApplicationConfig,
): ConfigurationBundle {
  if (bundle.applications.some((candidate) => candidate.id === application.id)) {
    throw new Error(`Application "${application.id}" already exists in this configuration.`);
  }

  return {
    ...bundle,
    applications: [...bundle.applications, application],
  };
}

export function replaceApplicationInConfigurationBundle(
  bundle: ConfigurationBundle,
  application: ApplicationConfig,
): ConfigurationBundle {
  let applicationWasUpdated = false;

  const applications = bundle.applications.map((candidateApplication) => {
    if (candidateApplication.id !== application.id) {
      return candidateApplication;
    }

    applicationWasUpdated = true;
    return application;
  });

  if (!applicationWasUpdated) {
    throw new Error(`Application "${application.id}" was not found in the selected configuration.`);
  }

  return {
    ...bundle,
    applications,
  };
}

export function replaceScreenInConfigurationBundle(
  bundle: ConfigurationBundle,
  applicationId: string,
  screen: ScreenConfig,
): ConfigurationBundle {
  let applicationWasUpdated = false;
  let screenWasUpdated = false;

  const applications = bundle.applications.map((application) => {
    if (application.id !== applicationId) {
      return application;
    }

    applicationWasUpdated = true;

    const screens = application.screens.map((candidateScreen) => {
      if (candidateScreen.id !== screen.id) {
        return candidateScreen;
      }

      screenWasUpdated = true;
      return screen;
    });

    return {
      ...application,
      screens,
    };
  });

  if (!applicationWasUpdated) {
    throw new Error(`Application "${applicationId}" was not found in the selected configuration.`);
  }

  if (!screenWasUpdated) {
    throw new Error(`Screen "${screen.id}" was not found in application "${applicationId}".`);
  }

  return {
    ...bundle,
    applications,
  };
}
