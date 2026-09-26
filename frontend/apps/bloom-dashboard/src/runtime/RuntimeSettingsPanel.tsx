import type { RuntimeLanguage, UserProfile } from "@bloom/api-client";
import { localizeOperatorText, PROFILE_TARGET_PX } from "@bloom/widgets";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { RuntimeStatusChip } from "./RuntimeKioskBar";
import { normalizeRuntimeProfileOverrides, type RuntimeProfileOverrides } from "./runtime-profile-overrides";
import { applyRuntimeProfileOverrides, type ResolvedRuntimeProfile } from "./runtimeProfile";
import { type RuntimeStrings, useRuntimeStrings } from "./strings";
import { useDwellActivation } from "./use-dwell-activation";
import { useSwitchScanning } from "./use-switch-scanning";

type InputMethod = "dwell" | "scan" | "touch";
type PushMode = "drag" | "latch" | "step";

type RuntimeSettingsPanelProps = {
  applicationName: string;
  /** The live status, as the kiosk bar shows it: it was always HELD here, even while STOPPED or LINK DOWN. */
  statusChip?: RuntimeStatusChip;
  baseProfile: ResolvedRuntimeProfile;
  /** The connected pad's name, or null when none is attached. */
  gamepadName?: string | null;
  onClose: () => void;
  onSave: (overrides: RuntimeProfileOverrides) => void;
  overrides: RuntimeProfileOverrides;
  runtimeRole: "bench" | "operator";
};

const TEXT_SIZES: readonly { key: "large" | "larger" | "normal"; scale: number }[] = [
  { key: "normal", scale: 1 },
  { key: "large", scale: 1.15 },
  { key: "larger", scale: 1.3 },
];

const PUSH_PRESETS: Record<PushMode, UserProfile["motor_accessibility_preset"]> = {
  drag: "default",
  latch: "latch",
  step: "step",
};

/**
 * Runtime settings (design 6a): only how a person reaches the controls, never what the app sends. Changes preview
 * live on this screen and reach the profile on "Save and resume"; "Discard changes" or Escape leaves without saving.
 */
export function RuntimeSettingsPanel({
  gamepadName = null,
  applicationName,
  statusChip,
  baseProfile,
  onClose,
  onSave,
  overrides,
  runtimeRole,
}: RuntimeSettingsPanelProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const [draft, setDraft] = useState(() => normalizeRuntimeProfileOverrides(overrides));
  const [tryCount, setTryCount] = useState(0);
  const lastTryRef = useRef(0);
  const profile = useMemo(() => applyRuntimeProfileOverrides(baseProfile, draft), [baseProfile, draft]);
  const strings = useRuntimeStrings(profile.language);
  const inputMethod: InputMethod =
    profile.motorAccessibilityPreset === "scan" ? "scan" : profile.dwellEnabled ? "dwell" : "touch";
  const pushMode: PushMode =
    profile.motorAccessibilityPreset === "step"
      ? "step"
      : profile.motorAccessibilityPreset === "latch"
        ? "latch"
        : "drag";
  const scanning = useSwitchScanning({
    enabled: inputMethod === "scan",
    periodMs: profile.scanPeriodMs,
    revision: `${inputMethod}:${pushMode}`,
    rootRef,
  });
  useDwellActivation({ dwellMs: profile.dwellMs, enabled: inputMethod === "dwell", rootRef });

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  // Settings replaces the controls; focus goes to it, not to <body>.
  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, []);

  const update = (next: RuntimeProfileOverrides) => setDraft(normalizeRuntimeProfileOverrides(next));
  const step = (key: "deadzone" | "dwellMs" | "repeatGuardMs" | "scanPeriodMs", delta: number) => {
    const clamped = applyRuntimeProfileOverrides(baseProfile, { ...draft, [key]: profile[key] + delta });
    update({ ...draft, [key]: key === "deadzone" ? Math.round(clamped[key] * 100) / 100 : clamped[key] });
  };
  const chooseInput = (method: InputMethod) =>
    update({
      ...draft,
      dwellEnabled: method === "dwell",
      motorAccessibilityPreset: method === "scan" ? "scan" : PUSH_PRESETS[pushMode],
    });
  const tryPress = () => {
    const now = Date.now();
    if (now - lastTryRef.current < profile.repeatGuardMs) {
      return;
    }
    lastTryRef.current = now;
    setTryCount((count) => count + 1);
  };
  const timing =
    inputMethod === "dwell"
      ? `${profile.dwellMs} ms`
      : inputMethod === "scan"
        ? `${(profile.scanPeriodMs / 1000).toFixed(1)} s`
        : strings.settings.immediate;
  const methodName = (method: InputMethod) => strings.settings.inputMethods[method];

  return (
    <section
      aria-label={strings.settings.title}
      className="runtime-settings"
      // Scanning, dwell and a high-visibility display all ask for the 64 px target.
      data-assistive={inputMethod !== "touch" || profile.displayPreset === "high-visibility" ? "true" : "false"}
      data-runtime-scanning={scanning.index >= 0 ? "true" : "false"}
      ref={rootRef}
      style={{ "--runtime-font-scale": profile.fontScale } as CSSProperties}
      tabIndex={-1}
    >
      <header className="runtime-kiosk-bar">
        <h2 className="runtime-kiosk-app">{applicationName}</h2>
        <span className="runtime-kiosk-screen">{strings.settings.title}</span>
        <span className="runtime-kiosk-status" data-tone={statusChip?.tone ?? "held"} role="status">
          <span aria-hidden="true" className="runtime-kiosk-status-dot" />
          {statusChip?.label ?? strings.status.held}
        </span>
        <span className="runtime-kiosk-spacer" />
        <span className="runtime-kiosk-role" data-role={runtimeRole}>
          {localizeOperatorText(baseProfile.name, profile.language)}
        </span>
      </header>

      <div className="runtime-settings-columns">
        <div className="runtime-settings-column">
          <h3 className="runtime-settings-group">{strings.settings.display}</h3>
          <SettingCard label={strings.settings.textSize} readout={`font_scale ${profile.fontScale.toFixed(2)}`}>
            <Segments
              label={strings.settings.textSize}
              onSelect={(scale) => update({ ...draft, fontScale: scale })}
              options={TEXT_SIZES.map((size) => ({
                label: strings.settings.textSizes[size.key],
                style: { fontSize: `${15 * size.scale}px` },
                value: size.scale,
              }))}
              selected={profile.fontScale}
            />
          </SettingCard>
          <SettingCard label={strings.settings.language} readout={profile.language}>
            <Segments
              label={strings.settings.language}
              onSelect={(language: RuntimeLanguage) => update({ ...draft, language })}
              options={(["en", "es", "fr"] as const).map((language) => ({
                label: language.toUpperCase(),
                value: language,
              }))}
              selected={profile.language}
            />
          </SettingCard>
          <div className="runtime-settings-card runtime-settings-card-row">
            <div>
              <strong>{strings.settings.sound}</strong>
              <span aria-hidden="true" className="runtime-settings-key">
                audio_cues
              </span>
            </div>
            <button
              aria-checked={profile.audioCues}
              aria-label={strings.settings.sound}
              className="runtime-settings-toggle"
              onClick={() => update({ ...draft, audioCues: !profile.audioCues })}
              role="switch"
              type="button"
            >
              {profile.audioCues ? strings.settings.valueOn : strings.settings.valueOff}
            </button>
          </div>

          <h3 className="runtime-settings-group">{strings.settings.reach}</h3>
          <SettingCard label={strings.settings.inputMethod} readout={profile.motorAccessibilityPreset}>
            <Segments
              label={strings.settings.inputMethod}
              onSelect={chooseInput}
              options={(["touch", "dwell", "scan"] as const).map((method) => ({
                label: methodName(method),
                value: method,
              }))}
              selected={inputMethod}
            />
          </SettingCard>
          <SettingCard
            interlocked={inputMethod === "scan" ? strings.settings.onlyForTouchAndDwell : undefined}
            label={strings.settings.pushMoves}
          >
            <Segments
              disabled={inputMethod === "scan"}
              label={strings.settings.pushMoves}
              onSelect={(mode: PushMode) => update({ ...draft, motorAccessibilityPreset: PUSH_PRESETS[mode] })}
              options={(["drag", "step", "latch"] as const).map((mode) => ({
                label: strings.settings.pushModes[mode],
                value: mode,
              }))}
              selected={pushMode}
            />
          </SettingCard>
        </div>

        <div className="runtime-settings-column">
          <h3 className="runtime-settings-group">
            {inputMethod === "touch" ? strings.settings.timingTouch : strings.settings.timing}
          </h3>
          <Stepper
            formatted={`${profile.dwellMs} ms`}
            interlocked={inputMethod === "dwell" ? undefined : strings.settings.onlyFor(methodName("dwell"))}
            label={strings.settings.holdToActivate}
            max={profile.dwellMs >= 4000}
            min={profile.dwellMs <= 400}
            onStep={(direction) => step("dwellMs", direction * 100)}
            settingKey="dwell_ms"
            strings={strings}
          />
          <Stepper
            formatted={`${profile.scanPeriodMs} ms`}
            interlocked={inputMethod === "scan" ? undefined : strings.settings.onlyFor(methodName("scan"))}
            label={strings.settings.scanStep}
            max={profile.scanPeriodMs >= 3000}
            min={profile.scanPeriodMs <= 600}
            onStep={(direction) => step("scanPeriodMs", direction * 200)}
            settingKey="scan_period_ms"
            strings={strings}
          />
          <Stepper
            formatted={`${profile.repeatGuardMs} ms`}
            label={strings.settings.ignoreRepeats}
            max={profile.repeatGuardMs >= 600}
            min={profile.repeatGuardMs <= 0}
            onStep={(direction) => step("repeatGuardMs", direction * 50)}
            settingKey="repeat_guard_ms"
            strings={strings}
          />
          <Stepper
            // 0 means no override: each control keeps the dead zone it was authored with.
            formatted={profile.deadzone > 0 ? profile.deadzone.toFixed(2) : strings.settings.deadzoneWidgetDefault}
            formattedIsWord={profile.deadzone <= 0}
            label={strings.settings.deadzone}
            max={profile.deadzone >= 0.5}
            min={profile.deadzone <= 0}
            onStep={(direction) => step("deadzone", direction * 0.05)}
            settingKey="deadzone"
            strings={strings}
          />
        </div>

        <div className="runtime-settings-column">
          <h3 className="runtime-settings-group">{strings.settings.tryIt}</h3>
          <div className="runtime-settings-card runtime-settings-try">
            <strong>{strings.settings.tryTitle}</strong>
            <button className="runtime-settings-try-target" onClick={tryPress} type="button">
              {strings.settings.tryTitle}
            </button>
            <p aria-live="polite">{tryCount > 0 ? strings.settings.tryPressed(tryCount) : strings.settings.tryIdle}</p>
            <output className="runtime-settings-key">
              {strings.settings.tryReadout(
                PROFILE_TARGET_PX[profile.displayPreset],
                profile.fontScale.toFixed(2),
                timing,
              )}
            </output>
            {scanning.index >= 0 ? (
              <>
                <button
                  className="runtime-settings-switch"
                  data-scan-switch=""
                  onClick={scanning.activateCurrent}
                  type="button"
                >
                  {strings.scan.button}
                </button>
                <p aria-live="off" className="sr-only">
                  {strings.scan.progress(scanning.index + 1, scanning.targetCount)}
                </p>
              </>
            ) : null}
          </div>
          <h3 className="runtime-settings-group">{strings.settings.inputs}</h3>
          <div className="runtime-settings-card runtime-settings-inputs">
            <p>{strings.settings.inputsKeyboard}</p>
            <p data-gamepad={gamepadName ? "connected" : "none"}>{strings.settings.inputsGamepad(gamepadName)}</p>
          </div>
          <button
            className="runtime-settings-save"
            onClick={() => {
              onSave(draft);
              onClose();
            }}
            type="button"
          >
            {strings.settings.saveAndResume}
          </button>
          <button className="runtime-settings-discard" onClick={onClose} type="button">
            {strings.settings.discardChanges}
          </button>
          <div className="runtime-settings-card runtime-settings-saved">
            <h4>{strings.settings.savedTo}</h4>
            <p>{strings.settings.savedToBody(localizeOperatorText(baseProfile.name, profile.language))}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function SettingCard({
  children,
  interlocked,
  label,
  readout,
}: {
  children: ReactNode;
  interlocked?: string;
  label: string;
  readout?: string;
}) {
  return (
    <div className="runtime-settings-card" data-interlocked={interlocked ? "true" : undefined}>
      <div className="runtime-settings-card-head">
        <strong>{label}</strong>
        {interlocked ? <span className="runtime-settings-interlock">{interlocked}</span> : null}
        {/* The stored key is for the person who edits the profile JSON; a screen reader reads the label instead. */}
        {readout ? (
          <span aria-hidden="true" className="runtime-settings-key">
            {readout}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function Segments<Value extends number | string>({
  disabled = false,
  label,
  onSelect,
  options,
  selected,
}: {
  disabled?: boolean;
  label: string;
  onSelect: (value: Value) => void;
  options: readonly { label: string; style?: CSSProperties; value: Value }[];
  selected: Value;
}) {
  return (
    <fieldset className="runtime-settings-segments">
      <legend className="sr-only">{label}</legend>
      {options.map((option) => (
        <button
          aria-pressed={option.value === selected}
          disabled={disabled}
          key={String(option.value)}
          onClick={() => onSelect(option.value)}
          style={option.style}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </fieldset>
  );
}

function Stepper({
  formatted,
  formattedIsWord = false,
  interlocked,
  label,
  max,
  min,
  onStep,
  settingKey,
  strings,
}: {
  formatted: string;
  formattedIsWord?: boolean;
  interlocked?: string;
  label: string;
  max: boolean;
  min: boolean;
  onStep: (direction: -1 | 1) => void;
  settingKey: string;
  strings: RuntimeStrings;
}) {
  return (
    <SettingCard interlocked={interlocked} label={label} readout={settingKey}>
      <div className="runtime-settings-stepper">
        <button
          aria-label={strings.settings.decrease(label)}
          disabled={Boolean(interlocked) || min}
          onClick={() => onStep(-1)}
          type="button"
        >
          −
        </button>
        <output aria-label={strings.settings.value(label)} data-word={formattedIsWord ? "true" : undefined}>
          {formatted}
        </output>
        <button
          aria-label={strings.settings.increase(label)}
          disabled={Boolean(interlocked) || max}
          onClick={() => onStep(1)}
          type="button"
        >
          +
        </button>
      </div>
    </SettingCard>
  );
}
