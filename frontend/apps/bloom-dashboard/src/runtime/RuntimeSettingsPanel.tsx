import type { RuntimeLanguage, UserProfile } from "@bloom/api-client";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  normalizeRuntimeProfileOverrides,
  type RuntimeProfileOverrides,
  runtimeProfileOverridesEqual,
} from "./runtime-profile-overrides";
import { applyRuntimeProfileOverrides, type ResolvedRuntimeProfile } from "./runtimeProfile";
import { type RuntimeStrings, useRuntimeStrings } from "./strings";
import { useDwellActivation } from "./use-dwell-activation";
import { useSwitchScanning } from "./use-switch-scanning";

type SettingsCategory = "display" | "frame" | "language" | "movement" | "tuning";

type RuntimeSettingsPanelProps = {
  allowedCommandFrameIds: readonly string[] | null;
  baseCommandFrameId: string | null;
  baseProfile: ResolvedRuntimeProfile;
  onChange: (overrides: RuntimeProfileOverrides) => void;
  onDone: () => void;
  onOpenTour: () => void;
  overrides: RuntimeProfileOverrides;
  teleopActive: boolean;
};

const CATEGORIES: readonly SettingsCategory[] = ["movement", "tuning", "frame", "language", "display"];

const MOVEMENT_CHOICES: readonly {
  disabled?: boolean;
  key: "default" | "edge" | "latch" | "scan" | "step";
  preset: UserProfile["motor_accessibility_preset"];
}[] = [
  { key: "default", preset: "default" },
  { key: "step", preset: "step" },
  { key: "latch", preset: "latch" },
  { key: "edge", disabled: true, preset: "assisted-touch" },
  { key: "scan", preset: "scan" },
];

type PreviewVector = { x: number; y: number };

const ZERO_VECTOR: PreviewVector = { x: 0, y: 0 };

export function RuntimeSettingsPanel({
  allowedCommandFrameIds,
  baseCommandFrameId,
  baseProfile,
  onChange,
  onDone,
  onOpenTour,
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
  const strings = useRuntimeStrings(profile.language);
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
      aria-label={strings.settings.title}
      className="runtime-settings"
      data-runtime-scanning={scanning.index >= 0 ? "true" : "false"}
      ref={rootRef}
      style={{ "--runtime-font-scale": profile.fontScale } as CSSProperties}
    >
      <header className="runtime-settings-header">
        <h2>{strings.settings.title}</h2>
        <span>{strings.settings.profileName(baseProfile.name)}</span>
        <div className="runtime-settings-header-actions">
          <button onClick={onOpenTour} type="button">
            {strings.settings.practiceTour}
          </button>
          {dirty ? (
            <button
              className="runtime-settings-undo"
              onClick={() => commitDraft(openingOverridesRef.current)}
              type="button"
            >
              {strings.settings.undo}
            </button>
          ) : null}
          <button className="runtime-settings-done" onClick={onDone} type="button">
            {strings.settings.done}
          </button>
        </div>
      </header>

      <div className="runtime-settings-body">
        <nav aria-label={strings.settings.title} className="runtime-settings-rail">
          {CATEGORIES.map((category) => (
            <button
              aria-controls={`runtime-settings-${category}`}
              aria-pressed={activeCategory === category}
              className="runtime-settings-category"
              key={category}
              onClick={() => setActiveCategory(category)}
              type="button"
            >
              {strings.settings.categories[category]}
            </button>
          ))}
        </nav>

        <div className="runtime-settings-main">
          <div className="runtime-settings-pane" id={`runtime-settings-${activeCategory}`} role="tabpanel">
            {activeCategory === "movement" ? (
              <MovementSettings
                activePreset={activeMovement}
                description={
                  activeMovementChoice
                    ? strings.settings.movementChoices[activeMovementChoice.key].description
                    : strings.settings.movementFallback
                }
                onSelect={(motorAccessibilityPreset) => commitDraft({ ...draft, motorAccessibilityPreset })}
                strings={strings}
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
                strings={strings}
              />
            ) : null}
            {activeCategory === "frame" ? (
              <FrameSettings
                activeFrameId={effectiveCommandFrameId}
                commandFrameIds={commandFrameIds}
                disabled={teleopActive}
                onSelect={(commandFrameId) => commitDraft({ ...draft, commandFrameId })}
                strings={strings}
              />
            ) : null}
            {activeCategory === "language" ? (
              <LanguageSettings
                activeLanguage={profile.language}
                onSelect={(language) => commitDraft({ ...draft, language })}
                strings={strings}
              />
            ) : null}
            {activeCategory === "display" ? <DisplaySettings profile={profile} strings={strings} /> : null}
          </div>

          <TrySettings
            onActivate={activatePreview}
            onSwitch={scanning.activateCurrent}
            previewVector={previewVector}
            scanIndex={scanning.index}
            scanTargetCount={scanning.targetCount}
            strings={strings}
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
  strings,
}: {
  activePreset: UserProfile["motor_accessibility_preset"];
  description: string;
  onSelect: (preset: UserProfile["motor_accessibility_preset"]) => void;
  strings: RuntimeStrings;
}) {
  return (
    <div className="runtime-settings-section">
      <div className="runtime-settings-section-heading">
        <p className="runtime-settings-eyebrow">{strings.settings.movementEyebrow}</p>
        <h3>{strings.settings.movementHeading}</h3>
      </div>
      <div className="runtime-settings-movement-options">
        {MOVEMENT_CHOICES.map((choice) => {
          const copy = strings.settings.movementChoices[choice.key];
          return (
            <button
              aria-pressed={activePreset === choice.preset}
              disabled={choice.disabled}
              key={choice.key}
              onClick={() => onSelect(choice.preset)}
              title={choice.disabled ? copy.description : undefined}
              type="button"
            >
              <strong>{copy.label}</strong>
              <span>{copy.description}</span>
            </button>
          );
        })}
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
  strings,
}: {
  onAudioCuesChange: (enabled: boolean) => void;
  onDeadzoneChange: (value: number) => void;
  onDwellEnabledChange: (enabled: boolean) => void;
  onDwellMsChange: (value: number) => void;
  onRepeatGuardMsChange: (value: number) => void;
  onScanPeriodMsChange: (value: number) => void;
  profile: ResolvedRuntimeProfile;
  strings: RuntimeStrings;
}) {
  return (
    <div className="runtime-settings-section runtime-settings-tuning">
      <div className="runtime-settings-section-heading">
        <p className="runtime-settings-eyebrow">{strings.settings.tuningEyebrow}</p>
        <h3>{strings.settings.tuningHeading}</h3>
      </div>
      <NumericSetting
        decreaseDisabled={profile.scanPeriodMs <= 600}
        formattedValue={`${(profile.scanPeriodMs / 1000).toFixed(1)} s`}
        increaseDisabled={profile.scanPeriodMs >= 3000}
        label={strings.settings.scanSpeed}
        onDecrease={() => onScanPeriodMsChange(profile.scanPeriodMs - 200)}
        onIncrease={() => onScanPeriodMsChange(profile.scanPeriodMs + 200)}
        strings={strings}
      />
      <NumericSetting
        decreaseDisabled={profile.deadzone <= 0}
        formattedValue={profile.deadzone.toFixed(2)}
        increaseDisabled={profile.deadzone >= 0.5}
        label={strings.settings.smallMovements}
        onDecrease={() => onDeadzoneChange(profile.deadzone - 0.05)}
        onIncrease={() => onDeadzoneChange(profile.deadzone + 0.05)}
        strings={strings}
      />
      <div className="runtime-settings-tuning-row runtime-settings-tuning-row-dwell">
        <div>
          <strong>{strings.settings.dwellLabel}</strong>
          <span>{strings.settings.dwellHelp}</span>
        </div>
        <NumericButtons
          decreaseDisabled={profile.dwellMs <= 400}
          formattedValue={`${profile.dwellMs} ms`}
          label={strings.settings.dwellLabel}
          increaseDisabled={profile.dwellMs >= 4000}
          onDecrease={() => onDwellMsChange(profile.dwellMs - 100)}
          onIncrease={() => onDwellMsChange(profile.dwellMs + 100)}
          strings={strings}
        />
        <ToggleButton
          checked={profile.dwellEnabled}
          label={strings.settings.restToSelect}
          onChange={onDwellEnabledChange}
          strings={strings}
        />
      </div>
      <NumericSetting
        decreaseDisabled={profile.repeatGuardMs <= 0}
        formattedValue={`${profile.repeatGuardMs} ms`}
        increaseDisabled={profile.repeatGuardMs >= 600}
        label={strings.settings.repeatGuard}
        onDecrease={() => onRepeatGuardMsChange(profile.repeatGuardMs - 50)}
        onIncrease={() => onRepeatGuardMsChange(profile.repeatGuardMs + 50)}
        strings={strings}
      />
      <div className="runtime-settings-tuning-row">
        <div>
          <strong>{strings.settings.statusSounds}</strong>
          <span>{strings.settings.statusSoundsHelp}</span>
        </div>
        <ToggleButton
          checked={profile.audioCues}
          label={strings.settings.statusSounds}
          onChange={onAudioCuesChange}
          strings={strings}
        />
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
  strings,
}: {
  decreaseDisabled: boolean;
  formattedValue: string;
  increaseDisabled: boolean;
  label: string;
  onDecrease: () => void;
  onIncrease: () => void;
  strings: RuntimeStrings;
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
        strings={strings}
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
  strings,
}: {
  decreaseDisabled: boolean;
  formattedValue: string;
  increaseDisabled: boolean;
  label: string;
  onDecrease: () => void;
  onIncrease: () => void;
  strings: RuntimeStrings;
}) {
  return (
    <div className="runtime-settings-stepper">
      <button
        aria-label={strings.settings.decrease(label)}
        disabled={decreaseDisabled}
        onClick={onDecrease}
        type="button"
      >
        -
      </button>
      <output aria-label={strings.settings.value(label)}>{formattedValue}</output>
      <button
        aria-label={strings.settings.increase(label)}
        disabled={increaseDisabled}
        onClick={onIncrease}
        type="button"
      >
        +
      </button>
    </div>
  );
}

function ToggleButton({
  checked,
  label,
  onChange,
  strings,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
  strings: RuntimeStrings;
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
      {checked ? strings.settings.valueOn : strings.settings.valueOff}
    </button>
  );
}

function FrameSettings({
  activeFrameId,
  commandFrameIds,
  disabled,
  onSelect,
  strings,
}: {
  activeFrameId: string | null;
  commandFrameIds: readonly string[];
  disabled: boolean;
  onSelect: (frameId: string) => void;
  strings: RuntimeStrings;
}) {
  return (
    <div className="runtime-settings-section">
      <div className="runtime-settings-section-heading">
        <p className="runtime-settings-eyebrow">{strings.settings.directionEyebrow}</p>
        <h3>{strings.settings.directionHeading}</h3>
      </div>
      {disabled ? <p className="runtime-settings-notice">{strings.settings.directionRelease}</p> : null}
      {commandFrameIds.length > 0 ? (
        <div className="runtime-settings-frame-options">
          {commandFrameIds.map((frameId) => {
            const frame = describeCommandFrame(frameId, strings);
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
        <p className="runtime-settings-notice">{strings.settings.frameUnavailable}</p>
      )}
    </div>
  );
}

function LanguageSettings({
  activeLanguage,
  onSelect,
  strings,
}: {
  activeLanguage: RuntimeLanguage;
  onSelect: (language: RuntimeLanguage) => void;
  strings: RuntimeStrings;
}) {
  return (
    <div className="runtime-settings-section">
      <div className="runtime-settings-section-heading">
        <p className="runtime-settings-eyebrow">{strings.settings.languageEyebrow}</p>
        <h3>{strings.settings.languageHeading}</h3>
      </div>
      <div className="runtime-settings-language-options">
        {(
          [
            ["en", "English"],
            ["es", "Español"],
            ["fr", "Français"],
          ] as const
        ).map(([language, label]) => (
          <button
            aria-pressed={activeLanguage === language}
            key={language}
            onClick={() => onSelect(language)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function DisplaySettings({ profile, strings }: { profile: ResolvedRuntimeProfile; strings: RuntimeStrings }) {
  return (
    <div className="runtime-settings-section">
      <div className="runtime-settings-section-heading">
        <p className="runtime-settings-eyebrow">{strings.settings.displayEyebrow}</p>
        <h3>{strings.settings.displayHeading}</h3>
      </div>
      <dl className="runtime-settings-readonly">
        <div>
          <dt>{strings.settings.displayLabel}</dt>
          <dd>{strings.settings.displayPresets[profile.displayPreset]}</dd>
        </div>
        <div>
          <dt>{strings.settings.textSize}</dt>
          <dd>{Math.round(profile.fontScale * 100)}%</dd>
        </div>
      </dl>
      <p className="runtime-settings-notice">{strings.settings.displayFixed}</p>
    </div>
  );
}

function TrySettings({
  onActivate,
  onSwitch,
  previewVector,
  scanIndex,
  scanTargetCount,
  strings,
}: {
  onActivate: (vector: PreviewVector) => void;
  onSwitch: () => void;
  previewVector: PreviewVector;
  scanIndex: number;
  scanTargetCount: number;
  strings: RuntimeStrings;
}) {
  return (
    <section aria-label={strings.settings.safePreview} className="runtime-settings-try">
      <div>
        <strong>{strings.settings.tryTitle}</strong>
        <span>{strings.settings.tryHelp}</span>
      </div>
      <div className="runtime-settings-try-buttons">
        <button onClick={() => onActivate({ x: -1, y: 0 })} type="button">
          {strings.settings.tryLeft}
        </button>
        <button onClick={() => onActivate({ x: 0, y: 1 })} type="button">
          {strings.settings.tryForward}
        </button>
        <button onClick={() => onActivate({ x: 1, y: 0 })} type="button">
          {strings.settings.tryRight}
        </button>
      </div>
      <output aria-label={strings.settings.value(strings.settings.safePreview)} className="runtime-settings-try-value">
        {`x ${formatPreviewAxis(previewVector.x)}  y ${formatPreviewAxis(previewVector.y)}`}
      </output>
      {scanIndex >= 0 ? (
        <button className="runtime-settings-switch" data-scan-switch="" onClick={onSwitch} type="button">
          {strings.scan.button}
        </button>
      ) : null}
      {scanIndex >= 0 ? (
        <p aria-live="polite" className="sr-only" role="status">
          {strings.scan.progress(scanIndex + 1, scanTargetCount)}
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

function describeCommandFrame(frameId: string, strings: RuntimeStrings): { description: string; label: string } {
  return strings.settings.frameDescriptions[frameId] ?? { label: frameId, description: strings.settings.frameFallback };
}

function clampPreviewAxis(value: number): number {
  return Math.min(1, Math.max(-1, value));
}

function formatPreviewAxis(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}
