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

export function addScreenToApplication(application: ApplicationConfig, screen: ScreenConfig): ApplicationConfig {
  if (application.screens.some((candidateScreen) => candidateScreen.id === screen.id)) {
    throw new Error(`Screen "${screen.id}" already exists in application "${application.id}".`);
  }

  return {
    ...application,
    screens: [...application.screens, structuredClone(screen)],
  };
}

export function duplicateScreenInApplication(application: ApplicationConfig, screenId: string): ApplicationConfig {
  const screen = application.screens.find((candidateScreen) => candidateScreen.id === screenId);

  if (!screen) {
    throw new Error(`Screen "${screenId}" was not found in application "${application.id}".`);
  }

  const duplicatedScreen = structuredClone(screen);
  const nextId = createUniqueId(
    `${screen.id}-copy`,
    application.screens.map((candidateScreen) => candidateScreen.id),
  );

  return {
    ...application,
    screens: [
      ...application.screens,
      {
        ...duplicatedScreen,
        id: nextId,
        title: `${screen.title} Copy`,
      },
    ],
  };
}

export function removeScreenFromApplication(application: ApplicationConfig, screenId: string): ApplicationConfig {
  if (!application.screens.some((candidateScreen) => candidateScreen.id === screenId)) {
    throw new Error(`Screen "${screenId}" was not found in application "${application.id}".`);
  }

  if (application.screens.length <= 1) {
    throw new Error(`Application "${application.id}" must keep at least one screen.`);
  }

  return {
    ...application,
    screens: application.screens.filter((screen) => screen.id !== screenId),
  };
}

export function createUniqueId(preferredId: string, existingIds: readonly string[]): string {
  const baseId = slugifyId(preferredId) || "screen";
  const takenIds = new Set(existingIds);

  if (!takenIds.has(baseId)) {
    return baseId;
  }

  let suffix = 2;
  let candidateId = `${baseId}-${suffix}`;

  while (takenIds.has(candidateId)) {
    suffix += 1;
    candidateId = `${baseId}-${suffix}`;
  }

  return candidateId;
}

function slugifyId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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
