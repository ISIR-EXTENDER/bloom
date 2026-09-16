import type { UserProfile } from "@bloom/api-client";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  normalizeRuntimeProfileOverrides,
  type RuntimeProfileOverrides,
  runtimeProfileOverridesEqual,
} from "./runtime-profile-overrides";
import { applyRuntimeProfileOverrides, type ResolvedRuntimeProfile } from "./runtimeProfile";
import { useDwellActivation } from "./use-dwell-activation";
import { useSwitchScanning } from "./use-switch-scanning";

type SettingsCategory = "display" | "frame" | "language" | "movement" | "tuning";

type RuntimeSettingsPanelProps = {
  allowedCommandFrameIds: readonly string[] | null;
  baseCommandFrameId: string | null;
  baseProfile: ResolvedRuntimeProfile;
  onChange: (overrides: RuntimeProfileOverrides) => void;
  onDone: () => void;
  overrides: RuntimeProfileOverrides;
  teleopActive: boolean;
};

const CATEGORIES: readonly { id: SettingsCategory; label: string }[] = [
  { id: "movement", label: "How I move it" },
  { id: "tuning", label: "Fine tuning" },
  { id: "frame", label: "Which way is forward" },
  { id: "language", label: "Language" },
  { id: "display", label: "Reading the screen" },
];

const MOVEMENT_CHOICES: readonly {
  description: string;
  disabled?: boolean;
  label: string;
  preset: UserProfile["motor_accessibility_preset"];
}[] = [
  { label: "Drag", description: "Move while your hand stays on the control.", preset: "default" },
  { label: "Tap by tap", description: "Each tap moves one small step.", preset: "step" },
  { label: "Keep going", description: "Movement continues after you let go; tap again to stop.", preset: "latch" },
  {
    label: "At the edge",
    description: "Edge movement is not available in this runtime yet.",
    disabled: true,
    preset: "assisted-touch",
  },
  { label: "One switch", description: "A highlight moves through every available control.", preset: "scan" },
];

type PreviewVector = { x: number; y: number };

const ZERO_VECTOR: PreviewVector = { x: 0, y: 0 };

export function RuntimeSettingsPanel({
  allowedCommandFrameIds,
  baseCommandFrameId,
  baseProfile,
  onChange,
  onDone,
  overrides,
  teleopActive,
}: RuntimeSettingsPanelProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const openingOverridesRef = useRef(normalizeRuntimeProfileOverrides(overrides));
  const previewTimerRef = useRef<number | null>(null);
  const lastPreviewActivationRef = useRef(0);
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>("movement");
  const [draft, setDraft] = useState(() => normalizeRuntimeProfileOverrides(overrides));
  const [previewVector, setPreviewVector] = useState<PreviewVector>(ZERO_VECTOR);
  const profile = useMemo(() => applyRuntimeProfileOverrides(baseProfile, draft), [baseProfile, draft]);
  const dirty = !runtimeProfileOverridesEqual(draft, openingOverridesRef.current);
  const scanning = useSwitchScanning({
    enabled: profile.motorAccessibilityPreset === "scan",
    periodMs: profile.scanPeriodMs,
    revision: activeCategory,
    rootRef,
  });
  useDwellActivation({
    dwellMs: profile.dwellMs,
    enabled: profile.dwellEnabled,
    rootRef,
  });

  useEffect(
    () => () => {
      if (previewTimerRef.current !== null) {
        window.clearTimeout(previewTimerRef.current);
      }
    },
    [],
  );

  const commitDraft = (nextValue: RuntimeProfileOverrides) => {
    const nextDraft = normalizeRuntimeProfileOverrides(nextValue);
    setDraft(nextDraft);
    onChange(nextDraft);
  };

  const commitNumber = (key: "deadzone" | "dwellMs" | "repeatGuardMs" | "scanPeriodMs", nextValue: number) => {
    const candidate = { ...draft, [key]: nextValue };
    const clampedProfile = applyRuntimeProfileOverrides(baseProfile, candidate);
    commitDraft({ ...draft, [key]: clampedProfile[key] });
  };

  const activatePreview = (nextVector: PreviewVector) => {
    const now = Date.now();
    if (now - lastPreviewActivationRef.current < profile.repeatGuardMs) {
      return;
    }
    lastPreviewActivationRef.current = now;
    if (previewTimerRef.current !== null) {
      window.clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }

    if (profile.motorAccessibilityPreset === "latch") {
      const isActiveDirection = previewVector.x === nextVector.x && previewVector.y === nextVector.y;
      setPreviewVector(isActiveDirection ? ZERO_VECTOR : nextVector);
      return;
    }

    if (profile.motorAccessibilityPreset === "step") {
      setPreviewVector((current) => ({
        x: clampPreviewAxis(current.x + nextVector.x * 0.25),
        y: clampPreviewAxis(current.y + nextVector.y * 0.25),
      }));
      return;
    }

    setPreviewVector(nextVector);
    previewTimerRef.current = window.setTimeout(() => setPreviewVector(ZERO_VECTOR), 500);
  };

  const activeMovement = normalizeMovementPreset(profile.motorAccessibilityPreset);
  const activeMovementChoice = MOVEMENT_CHOICES.find((choice) => choice.preset === activeMovement);
  const effectiveCommandFrameId = draft.commandFrameId ?? baseCommandFrameId;
  const commandFrameIds = resolveCommandFrameIds(allowedCommandFrameIds, effectiveCommandFrameId);

  return (
    <section
      aria-label="Settings"
      className="runtime-settings"
      data-runtime-scanning={scanning.index >= 0 ? "true" : "false"}
      ref={rootRef}
      style={{ "--runtime-font-scale": profile.fontScale } as CSSProperties}
    >
      <header className="runtime-settings-header">
        <h2>Settings</h2>
        <span>{baseProfile.name}&apos;s profile</span>
        <div className="runtime-settings-header-actions">
          {dirty ? (
            <button
              className="runtime-settings-undo"
              onClick={() => commitDraft(openingOverridesRef.current)}
              type="button"
            >
              Undo changes
            </button>
          ) : null}
          <button className="runtime-settings-done" onClick={onDone} type="button">
            Done
          </button>
        </div>
      </header>

      <div className="runtime-settings-body">
        <nav aria-label="Settings categories" className="runtime-settings-rail">
          {CATEGORIES.map((category) => (
            <button
              aria-controls={`runtime-settings-${category.id}`}
              aria-pressed={activeCategory === category.id}
              className="runtime-settings-category"
              key={category.id}
              onClick={() => setActiveCategory(category.id)}
              type="button"
            >
              {category.label}
            </button>
          ))}
        </nav>

        <div className="runtime-settings-main">
          <div className="runtime-settings-pane" id={`runtime-settings-${activeCategory}`} role="tabpanel">
            {activeCategory === "movement" ? (
              <MovementSettings
                activePreset={activeMovement}
                description={activeMovementChoice?.description ?? "Choose how controls respond to your movement."}
                onSelect={(motorAccessibilityPreset) => commitDraft({ ...draft, motorAccessibilityPreset })}
              />
            ) : null}
            {activeCategory === "tuning" ? (
              <TuningSettings
                onAudioCuesChange={(audioCues) => commitDraft({ ...draft, audioCues })}
                onDeadzoneChange={(deadzone) => commitNumber("deadzone", deadzone)}
                onDwellEnabledChange={(dwellEnabled) => commitDraft({ ...draft, dwellEnabled })}
                onDwellMsChange={(dwellMs) => commitNumber("dwellMs", dwellMs)}
                onRepeatGuardMsChange={(repeatGuardMs) => commitNumber("repeatGuardMs", repeatGuardMs)}
                onScanPeriodMsChange={(scanPeriodMs) => commitNumber("scanPeriodMs", scanPeriodMs)}
                profile={profile}
              />
            ) : null}
            {activeCategory === "frame" ? (
              <FrameSettings
                activeFrameId={effectiveCommandFrameId}
                commandFrameIds={commandFrameIds}
                disabled={teleopActive}
                onSelect={(commandFrameId) => commitDraft({ ...draft, commandFrameId })}
              />
            ) : null}
            {activeCategory === "language" ? <LanguageSettings /> : null}
            {activeCategory === "display" ? <DisplaySettings profile={profile} /> : null}
          </div>

          <TrySettings
            onActivate={activatePreview}
            onSwitch={scanning.activateCurrent}
            previewVector={previewVector}
            scanIndex={scanning.index}
            scanTargetCount={scanning.targetCount}
          />
        </div>
      </div>
    </section>
  );
}

function MovementSettings({
  activePreset,
  description,
  onSelect,
}: {
  activePreset: UserProfile["motor_accessibility_preset"];
  description: string;
  onSelect: (preset: UserProfile["motor_accessibility_preset"]) => void;
}) {
  return (
    <div className="runtime-settings-section">
      <div className="runtime-settings-section-heading">
        <p className="runtime-settings-eyebrow">Movement</p>
        <h3>How should the controls respond?</h3>
      </div>
      <div className="runtime-settings-movement-options">
        {MOVEMENT_CHOICES.map((choice) => (
          <button
            aria-pressed={activePreset === choice.preset}
            disabled={choice.disabled}
            key={choice.label}
            onClick={() => onSelect(choice.preset)}
            title={choice.disabled ? choice.description : undefined}
            type="button"
          >
            <strong>{choice.label}</strong>
            <span>{choice.description}</span>
          </button>
        ))}
      </div>
      <p className="runtime-settings-current-help">{description}</p>
    </div>
  );
}

function TuningSettings({
  onAudioCuesChange,
  onDeadzoneChange,
  onDwellEnabledChange,
  onDwellMsChange,
  onRepeatGuardMsChange,
  onScanPeriodMsChange,
  profile,
}: {
  onAudioCuesChange: (enabled: boolean) => void;
  onDeadzoneChange: (value: number) => void;
  onDwellEnabledChange: (enabled: boolean) => void;
  onDwellMsChange: (value: number) => void;
  onRepeatGuardMsChange: (value: number) => void;
  onScanPeriodMsChange: (value: number) => void;
  profile: ResolvedRuntimeProfile;
}) {
  return (
    <div className="runtime-settings-section runtime-settings-tuning">
      <div className="runtime-settings-section-heading">
        <p className="runtime-settings-eyebrow">Fine tuning</p>
        <h3>Adjust one clear step at a time.</h3>
      </div>
      <NumericSetting
        decreaseDisabled={profile.scanPeriodMs <= 600}
        formattedValue={`${(profile.scanPeriodMs / 1000).toFixed(1)} s`}
        increaseDisabled={profile.scanPeriodMs >= 3000}
        label="Scan speed"
        onDecrease={() => onScanPeriodMsChange(profile.scanPeriodMs - 200)}
        onIncrease={() => onScanPeriodMsChange(profile.scanPeriodMs + 200)}
      />
      <NumericSetting
        decreaseDisabled={profile.deadzone <= 0}
        formattedValue={profile.deadzone.toFixed(2)}
        increaseDisabled={profile.deadzone >= 0.5}
        label="Ignore small movements"
        onDecrease={() => onDeadzoneChange(profile.deadzone - 0.05)}
        onIncrease={() => onDeadzoneChange(profile.deadzone + 0.05)}
      />
      <div className="runtime-settings-tuning-row runtime-settings-tuning-row-dwell">
        <div>
          <strong>Hold before it counts</strong>
          <span>Rest on a control to select it</span>
        </div>
        <NumericButtons
          decreaseDisabled={profile.dwellMs <= 400}
          formattedValue={`${profile.dwellMs} ms`}
          label="Hold before it counts"
          increaseDisabled={profile.dwellMs >= 4000}
          onDecrease={() => onDwellMsChange(profile.dwellMs - 100)}
          onIncrease={() => onDwellMsChange(profile.dwellMs + 100)}
        />
        <ToggleButton checked={profile.dwellEnabled} label="Rest to select" onChange={onDwellEnabledChange} />
      </div>
      <NumericSetting
        decreaseDisabled={profile.repeatGuardMs <= 0}
        formattedValue={`${profile.repeatGuardMs} ms`}
        increaseDisabled={profile.repeatGuardMs >= 600}
        label="Ignore repeated taps"
        onDecrease={() => onRepeatGuardMsChange(profile.repeatGuardMs - 50)}
        onIncrease={() => onRepeatGuardMsChange(profile.repeatGuardMs + 50)}
      />
      <div className="runtime-settings-tuning-row">
        <div>
          <strong>Status sounds</strong>
          <span>Hear stop, link loss, and recovery</span>
        </div>
        <ToggleButton checked={profile.audioCues} label="Status sounds" onChange={onAudioCuesChange} />
      </div>
    </div>
  );
}

function NumericSetting({
  decreaseDisabled,
  formattedValue,
  increaseDisabled,
  label,
  onDecrease,
  onIncrease,
}: {
  decreaseDisabled: boolean;
  formattedValue: string;
  increaseDisabled: boolean;
  label: string;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  return (
    <div className="runtime-settings-tuning-row">
      <strong>{label}</strong>
      <NumericButtons
        decreaseDisabled={decreaseDisabled}
        formattedValue={formattedValue}
        increaseDisabled={increaseDisabled}
        label={label}
        onDecrease={onDecrease}
        onIncrease={onIncrease}
      />
    </div>
  );
}

function NumericButtons({
  decreaseDisabled,
  formattedValue,
  increaseDisabled,
  label,
  onDecrease,
  onIncrease,
}: {
  decreaseDisabled: boolean;
  formattedValue: string;
  increaseDisabled: boolean;
  label: string;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  return (
    <div className="runtime-settings-stepper">
      <button aria-label={`Decrease ${label}`} disabled={decreaseDisabled} onClick={onDecrease} type="button">
        -
      </button>
      <output aria-label={`${label} value`}>{formattedValue}</output>
      <button aria-label={`Increase ${label}`} disabled={increaseDisabled} onClick={onIncrease} type="button">
        +
      </button>
    </div>
  );
}

function ToggleButton({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      aria-checked={checked}
      aria-label={label}
      className="runtime-settings-toggle"
      onClick={() => onChange(!checked)}
      role="switch"
      type="button"
    >
      {checked ? "On" : "Off"}
    </button>
  );
}

function FrameSettings({
  activeFrameId,
  commandFrameIds,
  disabled,
  onSelect,
}: {
  activeFrameId: string | null;
  commandFrameIds: readonly string[];
  disabled: boolean;
  onSelect: (frameId: string) => void;
}) {
  return (
    <div className="runtime-settings-section">
      <div className="runtime-settings-section-heading">
        <p className="runtime-settings-eyebrow">Direction</p>
        <h3>Choose what forward follows.</h3>
      </div>
      {disabled ? (
        <p className="runtime-settings-notice">Release every movement control before changing direction.</p>
      ) : null}
      {commandFrameIds.length > 0 ? (
        <div className="runtime-settings-frame-options">
          {commandFrameIds.map((frameId) => {
            const frame = describeCommandFrame(frameId);
            return (
              <button
                aria-pressed={activeFrameId === frameId}
                disabled={disabled}
                key={frameId}
                onClick={() => onSelect(frameId)}
                type="button"
              >
                <strong>{frame.label}</strong>
                <span>{frame.description}</span>
                <code>{frameId}</code>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="runtime-settings-notice">The connected runtime has not reported any command frames.</p>
      )}
    </div>
  );
}

function LanguageSettings() {
  return (
    <div className="runtime-settings-section">
      <div className="runtime-settings-section-heading">
        <p className="runtime-settings-eyebrow">Language</p>
        <h3>English</h3>
      </div>
      <p className="runtime-settings-notice">
        This profile currently uses English. English, Spanish, and French choices arrive with the runtime language
        catalogue in Lot 2.
      </p>
    </div>
  );
}

function DisplaySettings({ profile }: { profile: ResolvedRuntimeProfile }) {
  return (
    <div className="runtime-settings-section">
      <div className="runtime-settings-section-heading">
        <p className="runtime-settings-eyebrow">Reading the screen</p>
        <h3>Installed display profile</h3>
      </div>
      <dl className="runtime-settings-readonly">
        <div>
          <dt>Display</dt>
          <dd>{formatDisplayPreset(profile.displayPreset)}</dd>
        </div>
        <div>
          <dt>Text size</dt>
          <dd>{Math.round(profile.fontScale * 100)}%</dd>
        </div>
      </dl>
      <p className="runtime-settings-notice">Display settings are fixed during tablet installation.</p>
    </div>
  );
}

function TrySettings({
  onActivate,
  onSwitch,
  previewVector,
  scanIndex,
  scanTargetCount,
}: {
  onActivate: (vector: PreviewVector) => void;
  onSwitch: () => void;
  previewVector: PreviewVector;
  scanIndex: number;
  scanTargetCount: number;
}) {
  return (
    <section aria-label="Safe preview" className="runtime-settings-try">
      <div>
        <strong>Try it here</strong>
        <span>These buttons never send anything to the robot.</span>
      </div>
      <div className="runtime-settings-try-buttons">
        <button onClick={() => onActivate({ x: -1, y: 0 })} type="button">
          Left
        </button>
        <button onClick={() => onActivate({ x: 0, y: 1 })} type="button">
          Forward
        </button>
        <button onClick={() => onActivate({ x: 1, y: 0 })} type="button">
          Right
        </button>
      </div>
      <output aria-label="Try current settings value" className="runtime-settings-try-value">
        {`x ${formatPreviewAxis(previewVector.x)}  y ${formatPreviewAxis(previewVector.y)}`}
      </output>
      {scanIndex >= 0 ? (
        <button className="runtime-settings-switch" data-scan-switch="" onClick={onSwitch} type="button">
          SWITCH
        </button>
      ) : null}
      {scanIndex >= 0 ? (
        <p aria-live="polite" className="sr-only" role="status">
          {`Scanning ${scanIndex + 1} of ${scanTargetCount}.`}
        </p>
      ) : null}
    </section>
  );
}

function normalizeMovementPreset(
  preset: UserProfile["motor_accessibility_preset"],
): UserProfile["motor_accessibility_preset"] {
  if (preset === "assisted-touch" || preset === "dwell" || preset === "large-targets" || preset === "reduced-motion") {
    return "default";
  }
  return preset;
}

function resolveCommandFrameIds(allowed: readonly string[] | null, active: string | null): string[] {
  if (allowed && allowed.length > 0) {
    return [...new Set(allowed)];
  }
  return active ? [active] : [];
}

function describeCommandFrame(frameId: string): { description: string; label: string } {
  if (frameId === "base_link") {
    return { label: "Robot axes", description: "Forward stays aligned with the robot base." };
  }
  if (frameId === "effector_frame") {
    return { label: "Tool direction", description: "Forward follows the tool at the end of the arm." };
  }
  if (frameId === "hybrid_frame") {
    return { label: "Where I look", description: "Translation follows the operator-facing hybrid frame." };
  }
  if (frameId === "ft_frame") {
    return { label: "Force sensor", description: "Forward follows the force sensor frame." };
  }
  return { label: frameId, description: "Use this frame reported by the connected runtime." };
}

function formatDisplayPreset(preset: ResolvedRuntimeProfile["displayPreset"]): string {
  return preset
    .split("-")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function clampPreviewAxis(value: number): number {
  return Math.min(1, Math.max(-1, value));
}

function formatPreviewAxis(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}
