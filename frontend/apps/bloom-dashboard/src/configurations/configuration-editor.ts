import type { ApplicationConfig, ConfigurationBundle, ScreenConfig, UserProfile } from "@bloom/api-client";

export function duplicateApplicationInConfigurationBundle(
  bundle: ConfigurationBundle,
  applicationId: string,
): ApplicationConfig {
  const application = bundle.applications.find((candidateApplication) => candidateApplication.id === applicationId);

  if (!application) {
    throw new Error(`Application "${applicationId}" was not found in the selected configuration.`);
  }

  const nextId = createUniqueId(
    `${application.id}-copy`,
    bundle.applications.map((candidateApplication) => candidateApplication.id),
  );

  return {
    ...structuredClone(application),
    id: nextId,
    name: `${application.name} Copy`,
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

  const remaining = application.screens.filter((screen) => screen.id !== screenId);
  return {
    ...application,
    screens: remaining,
    // A profile left naming a deleted screen falls back to the first one at runtime, so an operator
    // opens whatever that happens to be -- the bench layout, on the shipped Manager apps. Repoint the
    // role at the screen that is now first, which is what the fallback would have given it anyway,
    // except that the app's own review can see it and say so.
    profiles: application.profiles.map((profile) =>
      profile.preferred_control_layout_id === screenId
        ? { ...profile, preferred_control_layout_id: remaining[0]?.id ?? "" }
        : profile,
    ),
  };
}

export function reorderScreenInApplication(
  application: ApplicationConfig,
  screenId: string,
  direction: "down" | "up",
): ApplicationConfig {
  const currentIndex = application.screens.findIndex((screen) => screen.id === screenId);

  if (currentIndex < 0) {
    throw new Error(`Screen "${screenId}" was not found in application "${application.id}".`);
  }

  const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (nextIndex < 0 || nextIndex >= application.screens.length) {
    return application;
  }

  const screens = [...application.screens];
  const [screen] = screens.splice(currentIndex, 1);
  if (!screen) {
    return application;
  }
  screens.splice(nextIndex, 0, screen);

  return {
    ...application,
    screens,
  };
}

export function moveScreenBeforeInApplication(
  application: ApplicationConfig,
  screenId: string,
  targetScreenId: string,
): ApplicationConfig {
  if (screenId === targetScreenId) {
    return application;
  }

  const screen = application.screens.find((candidateScreen) => candidateScreen.id === screenId);
  if (!screen) {
    throw new Error(`Screen "${screenId}" was not found in application "${application.id}".`);
  }

  const screensWithoutMovedScreen = application.screens.filter((candidateScreen) => candidateScreen.id !== screenId);
  const targetIndex = screensWithoutMovedScreen.findIndex((candidateScreen) => candidateScreen.id === targetScreenId);

  if (targetIndex < 0) {
    throw new Error(`Screen "${targetScreenId}" was not found in application "${application.id}".`);
  }

  return {
    ...application,
    screens: [
      ...screensWithoutMovedScreen.slice(0, targetIndex),
      screen,
      ...screensWithoutMovedScreen.slice(targetIndex),
    ],
  };
}

export function createUniqueId(preferredId: string, existingIds: readonly string[]): string {
  return ensureUniqueId(slugifyId(preferredId) || "screen", new Set(existingIds));
}

/** `id`, or `id-2`, `id-3`... until it is not taken. */
export function ensureUniqueId(id: string, takenIds: ReadonlySet<string>): string {
  if (!takenIds.has(id)) {
    return id;
  }

  let suffix = 2;
  let candidateId = `${id}-${suffix}`;

  while (takenIds.has(candidateId)) {
    suffix += 1;
    candidateId = `${id}-${suffix}`;
  }

  return candidateId;
}

export function slugifyId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Roles.
 *
 * A profile is what the library offers as a role, what the kiosk bar switches between, and which screen
 * opens for whoever picked it. The shipped apps carry three; until now the Builder could mint exactly
 * one, hardcoded, at app creation, so the whole scanning and one-switch story was unauthorable.
 */
export function addProfileToApplication(application: ApplicationConfig, profile: UserProfile): ApplicationConfig {
  if (application.profiles.some((candidate) => candidate.id === profile.id)) {
    throw new Error(`Role "${profile.id}" already exists in application "${application.id}".`);
  }

  return { ...application, profiles: [...application.profiles, structuredClone(profile)] };
}

export function updateProfileInApplication(
  application: ApplicationConfig,
  profileId: string,
  patch: Partial<UserProfile>,
): ApplicationConfig {
  if (!application.profiles.some((profile) => profile.id === profileId)) {
    throw new Error(`Role "${profileId}" was not found in application "${application.id}".`);
  }

  return {
    ...application,
    profiles: application.profiles.map((profile) => (profile.id === profileId ? { ...profile, ...patch } : profile)),
  };
}

export function removeProfileFromApplication(application: ApplicationConfig, profileId: string): ApplicationConfig {
  if (!application.profiles.some((profile) => profile.id === profileId)) {
    throw new Error(`Role "${profileId}" was not found in application "${application.id}".`);
  }
  // An app with no role still opens: the library offers it directly and the runtime falls back to a
  // comfort profile. Keeping one artificially would be a rule the runtime does not have.
  return { ...application, profiles: application.profiles.filter((profile) => profile.id !== profileId) };
}
