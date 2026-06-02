import type { WidgetConfig } from "@bloom/api-client";

export type AppExtensionDefinition = {
  description?: string;
  id: string;
  label: string;
  legacyWidgetKinds: string[];
  rendererKey?: string;
  runtimeAdapterKey?: string;
};

export type AppExtensionRegistry = ReadonlyMap<string, AppExtensionDefinition>;

export type WidgetAppExtensionResolution =
  | {
      status: "none";
    }
  | {
      extension: AppExtensionDefinition;
      legacyKind: string;
      status: "resolved";
    }
  | {
      legacyKind: string;
      reason: string;
      status: "missing";
    };

export function createAppExtensionRegistry(extensions: readonly AppExtensionDefinition[] = []): AppExtensionRegistry {
  const registry = new Map<string, AppExtensionDefinition>();
  const legacyKindOwners = new Map<string, string>();

  for (const extension of extensions) {
    if (registry.has(extension.id)) {
      throw new Error(`Duplicate app extension "${extension.id}".`);
    }

    for (const legacyKind of extension.legacyWidgetKinds) {
      const existingOwner = legacyKindOwners.get(legacyKind);
      if (existingOwner) {
        throw new Error(`Legacy widget kind "${legacyKind}" is already owned by app extension "${existingOwner}".`);
      }
      legacyKindOwners.set(legacyKind, extension.id);
    }

    registry.set(extension.id, extension);
  }

  return registry;
}

export function resolveWidgetAppExtension(
  widget: WidgetConfig,
  registry: AppExtensionRegistry,
): WidgetAppExtensionResolution {
  const explicitExtensionId = getStringSetting(widget.settings, "appExtensionId");
  const legacyKind = getStringSetting(widget.settings, "legacyKind");

  if (explicitExtensionId) {
    const extension = registry.get(explicitExtensionId);
    if (!extension) {
      return {
        status: "missing",
        legacyKind: legacyKind ?? widget.kind,
        reason: `No app extension registered for id "${explicitExtensionId}".`,
      };
    }

    return {
      status: "resolved",
      extension,
      legacyKind: legacyKind ?? widget.kind,
    };
  }

  if (!legacyKind) {
    return {
      status: "none",
    };
  }
  return {
    status: "none",
  };
}

function getStringSetting(settings: Record<string, unknown>, key: string): string | undefined {
  const value = settings[key];
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : undefined;
}
