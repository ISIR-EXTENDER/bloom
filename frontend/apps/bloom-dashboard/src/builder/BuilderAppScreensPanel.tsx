import type { ScreenConfig } from "@bloom/api-client";
import {
  BLOOM_APP_SCREEN_REORDER_DRAG_TYPE,
  BLOOM_SCREEN_DRAG_TYPE,
  canReceiveBloomDrag,
  readBloomDragPayload,
  writeBloomDragPayload,
} from "../ui/dragDrop";
import { getTouchEditingProps } from "../ui/touchEditing";
import {
  type AvailableScreen,
  createFeatureAccentStyle,
  createScreenAccentStyle,
  describeScreenFeature,
  groupAvailableScreensByFeature,
  screenFeatureLabel,
} from "./app-config-model";
import { countLabel } from "./builderHomeModel";

type ScreenCardAction = {
  ariaLabel: string;
  disabled?: boolean;
  isDanger?: boolean;
  label: string;
  onClick: () => void;
};

type BuilderAppScreensPanelProps = {
  isDirty: boolean;
  isSaving: boolean;
  newScreenName: string;
  onAddScreen: (screen: ScreenConfig) => void;
  onAddScreenById: (screenId: string) => void;
  onCreateScreen: () => void;
  onDuplicateScreen: (screenId: string) => void;
  onMoveScreenBefore: (screenId: string, targetScreenId: string) => void;
  onNewScreenNameChange: (name: string) => void;
  onOpenScreenBuilder: (screenId: string) => void;
  onRemoveScreen: (screenId: string) => void;
  onReorderScreen: (screenId: string, direction: "down" | "up") => void;
  screens: readonly ScreenConfig[];
  unassignedScreens: readonly AvailableScreen[];
};

export function BuilderAppScreensPanel({
  isDirty,
  isSaving,
  newScreenName,
  onAddScreen,
  onAddScreenById,
  onCreateScreen,
  onDuplicateScreen,
  onMoveScreenBefore,
  onNewScreenNameChange,
  onOpenScreenBuilder,
  onRemoveScreen,
  onReorderScreen,
  screens,
  unassignedScreens,
}: BuilderAppScreensPanelProps) {
  const availableScreenGroups = groupAvailableScreensByFeature(unassignedScreens);

  return (
    <section className="builder-config-panel builder-screens-panel" aria-labelledby="builder-screens-title">
      <div className="builder-config-panel-header">
        <div>
          <p className="eyebrow">Screens</p>
          <h2 id="builder-screens-title">Build this app flow</h2>
        </div>
        <span className="builder-section-badge">{countLabel(screens.length, "screen")}</span>
      </div>
      <div className="builder-screen-create-card">
        <div>
          <h3>Create a screen</h3>
          <p className="builder-inspector-copy">
            Start from a blank screen, then save the app before opening it in the WYSIWYG builder.
          </p>
        </div>
        <label className="builder-settings-field">
          <span>New screen name</span>
          <input
            {...getTouchEditingProps("name")}
            onChange={(event) => onNewScreenNameChange(event.target.value)}
            type="text"
            value={newScreenName}
          />
        </label>
        <button disabled={isSaving} onClick={onCreateScreen} type="button">
          Create screen
        </button>
      </div>
      <div className="builder-screen-membership">
        <div>
          <div className="builder-screen-section-heading">
            <h3>Screens in this app</h3>
            <span>{screens.length}</span>
          </div>
          {isDirty ? (
            <p className="builder-inline-hint">Save or discard app changes before opening a screen builder.</p>
          ) : null}
          <section
            aria-label="Screens currently assigned to this app. Drop reusable screens here to add them."
            className="builder-screen-cards builder-screen-dropzone"
            onDragOver={(event) => {
              if (canReceiveBloomDrag(event.dataTransfer, BLOOM_SCREEN_DRAG_TYPE)) {
                event.preventDefault();
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              onAddScreenById(readBloomDragPayload(event.dataTransfer, BLOOM_SCREEN_DRAG_TYPE));
            }}
          >
            {screens.map((screen, screenIndex) => (
              <ScreenCard
                actions={[
                  {
                    ariaLabel: `Open ${screen.title} screen builder`,
                    disabled: isDirty || isSaving,
                    label: "Open builder",
                    onClick: () => onOpenScreenBuilder(screen.id),
                  },
                  {
                    ariaLabel: `Move ${screen.title} earlier in app`,
                    disabled: screenIndex === 0 || isSaving,
                    label: "Move up",
                    onClick: () => onReorderScreen(screen.id, "up"),
                  },
                  {
                    ariaLabel: `Move ${screen.title} later in app`,
                    disabled: screenIndex === screens.length - 1 || isSaving,
                    label: "Move down",
                    onClick: () => onReorderScreen(screen.id, "down"),
                  },
                  {
                    ariaLabel: `Remove ${screen.title} from app`,
                    disabled: screens.length <= 1 || isSaving,
                    isDanger: true,
                    label: "Remove",
                    onClick: () => onRemoveScreen(screen.id),
                  },
                  {
                    ariaLabel: `Duplicate ${screen.title} screen`,
                    disabled: isSaving,
                    label: "Duplicate",
                    onClick: () => onDuplicateScreen(screen.id),
                  },
                ]}
                draggable={!isSaving}
                key={screen.id}
                onDropBefore={(screenId) => onMoveScreenBefore(screenId, screen.id)}
                reorderDragType={BLOOM_APP_SCREEN_REORDER_DRAG_TYPE}
                screen={screen}
              />
            ))}
          </section>
        </div>

        <div>
          <div className="builder-screen-section-heading">
            <h3>Available screens</h3>
            <span>{unassignedScreens.length}</span>
          </div>
          <p className="builder-inspector-copy">
            Reuse screens from any app in this configuration. Drag one into the app flow, or use the button fallback.
          </p>
          <div className="builder-screen-available-groups">
            {unassignedScreens.length === 0 ? (
              <p className="builder-empty-state">No extra reusable screens available yet.</p>
            ) : (
              availableScreenGroups.map((group) => (
                <section
                  className="builder-screen-available-group"
                  key={group.feature}
                  style={createFeatureAccentStyle(group.feature)}
                >
                  <div className="builder-screen-available-group-heading">
                    <h4>{screenFeatureLabel(group.feature)}</h4>
                    <span>{group.screens.length}</span>
                  </div>
                  <div className="builder-screen-cards">
                    {group.screens.map(({ screen, sourceApplicationName }) => (
                      <ScreenCard
                        actions={[
                          {
                            ariaLabel: `Add ${screen.title} to app`,
                            disabled: isSaving,
                            label: "Add to app",
                            onClick: () => onAddScreen(screen),
                          },
                        ]}
                        draggable={!isSaving}
                        key={`${sourceApplicationName}-${screen.id}`}
                        screen={screen}
                        sourceApplicationName={sourceApplicationName}
                      />
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function ScreenCard({
  actions,
  draggable = false,
  onDropBefore,
  reorderDragType = BLOOM_SCREEN_DRAG_TYPE,
  screen,
  sourceApplicationName,
}: {
  actions: readonly ScreenCardAction[];
  draggable?: boolean;
  onDropBefore?: (screenId: string) => void;
  reorderDragType?: string;
  screen: ScreenConfig;
  sourceApplicationName?: string;
}) {
  return (
    <article
      className="builder-screen-card"
      draggable={draggable}
      onDragOver={(event) => {
        if (onDropBefore && canReceiveBloomDrag(event.dataTransfer, reorderDragType)) {
          event.preventDefault();
        }
      }}
      onDragStart={(event) => {
        if (!draggable) {
          return;
        }
        writeBloomDragPayload(event.dataTransfer, reorderDragType, screen.id);
      }}
      onDrop={(event) => {
        if (!onDropBefore || !canReceiveBloomDrag(event.dataTransfer, reorderDragType)) {
          return;
        }
        event.preventDefault();
        onDropBefore(readBloomDragPayload(event.dataTransfer, reorderDragType));
      }}
      style={createScreenAccentStyle(screen)}
    >
      <div className="builder-screen-card-main">
        <strong>{screen.title}</strong>
        <div className="builder-screen-card-details">
          <span>{describeScreenFeature(screen)}</span>
          {sourceApplicationName ? <span>From {sourceApplicationName}</span> : null}
        </div>
      </div>
      <div className="builder-screen-card-actions">
        {actions.map((action) => (
          <button
            aria-label={action.ariaLabel}
            className={action.isDanger ? "builder-screen-action-danger" : undefined}
            disabled={action.disabled}
            key={action.label}
            onClick={action.onClick}
            type="button"
          >
            {action.label}
          </button>
        ))}
      </div>
    </article>
  );
}
