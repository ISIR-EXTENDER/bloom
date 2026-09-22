import type { ApplicationConfig, UserProfile } from "@bloom/api-client";

/**
 * Roles, as an author can finally write them.
 *
 * A role is what the library offers, what the kiosk bar switches between, and which screen opens for
 * whoever picked it. The shipped Manager apps carry three -- Operator, Bench, One switch -- and until
 * now the Builder minted exactly one, hardcoded, at app creation. Everything about how a person reaches
 * the controls lives here, so without it the scanning and one-switch story could not be authored at all.
 */

/** Only the presets the runtime actually branches on; `reduced-motion` is accepted and does nothing. */
const MOTOR_PRESETS: readonly { id: UserProfile["motor_accessibility_preset"]; label: string }[] = [
  { id: "default", label: "Touch and drag" },
  { id: "large-targets", label: "Touch, larger targets" },
  { id: "step", label: "Tap by tap" },
  { id: "latch", label: "Keep going until stopped" },
  { id: "scan", label: "Switch scanning" },
  { id: "dwell", label: "Dwell (rest to press)" },
  { id: "assisted-touch", label: "Assisted touch" },
];

const DISPLAY_PRESETS: readonly { id: UserProfile["display_preset"]; label: string }[] = [
  { id: "default", label: "Default · 48 px targets" },
  { id: "compact", label: "Compact · 40 px" },
  { id: "comfort", label: "Comfort · 56 px" },
  { id: "high-visibility", label: "High visibility · 64 px" },
];

const LANGUAGES: readonly { id: UserProfile["language"]; label: string }[] = [
  { id: "en", label: "English" },
  { id: "es", label: "Español" },
  { id: "fr", label: "Français" },
];

export function BuilderProfilesPanel({
  application,
  onAddProfile,
  onRemoveProfile,
  onUpdateProfile,
}: {
  application: ApplicationConfig;
  onAddProfile: () => void;
  onRemoveProfile: (profileId: string) => void;
  onUpdateProfile: (profileId: string, patch: Partial<UserProfile>) => void;
}) {
  return (
    <section className="builder-config-panel" aria-labelledby="builder-profiles-title">
      <header>
        <p className="eyebrow">Roles</p>
        <h3 id="builder-profiles-title">Who opens this app, and how they reach it</h3>
        <p className="builder-inspector-copy">
          The library offers one card per role. Two roles can send the same commands and differ only in what the person
          in front of the screen has to read and reach.
        </p>
      </header>

      {application.profiles.length === 0 ? (
        <p className="builder-inspector-copy">
          No roles yet. Without one the app still opens, and everyone gets the same layout.
        </p>
      ) : null}

      <ul className="builder-profile-list">
        {application.profiles.map((profile) => (
          <li className="builder-profile-card" key={profile.id}>
            <div className="builder-profile-row">
              <label>
                <span>Name</span>
                <input
                  onChange={(event) => onUpdateProfile(profile.id, { name: event.target.value })}
                  value={profile.name}
                />
              </label>
              <label>
                <span>Opens on</span>
                <select
                  onChange={(event) => onUpdateProfile(profile.id, { preferred_control_layout_id: event.target.value })}
                  value={profile.preferred_control_layout_id}
                >
                  {/* A role naming no screen lands on the first one, which is another role's layout. */}
                  <option value="">First screen</option>
                  {application.screens.map((screen) => (
                    <option key={screen.id} value={screen.id}>
                      {screen.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="builder-profile-row">
              <label>
                <span>Targets</span>
                <select
                  onChange={(event) =>
                    onUpdateProfile(profile.id, {
                      display_preset: event.target.value as UserProfile["display_preset"],
                    })
                  }
                  value={profile.display_preset}
                >
                  {DISPLAY_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>How they reach controls</span>
                <select
                  onChange={(event) =>
                    onUpdateProfile(profile.id, {
                      motor_accessibility_preset: event.target.value as UserProfile["motor_accessibility_preset"],
                    })
                  }
                  value={profile.motor_accessibility_preset}
                >
                  {MOTOR_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Language</span>
                <select
                  onChange={(event) =>
                    onUpdateProfile(profile.id, { language: event.target.value as UserProfile["language"] })
                  }
                  value={profile.language}
                >
                  {LANGUAGES.map((language) => (
                    <option key={language.id} value={language.id}>
                      {language.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="builder-profile-row">
              <label>
                <span>Text size</span>
                <input
                  max={2}
                  min={0.75}
                  onChange={(event) => onUpdateProfile(profile.id, { font_scale: Number(event.target.value) })}
                  step={0.05}
                  type="number"
                  value={profile.font_scale}
                />
              </label>
              {/* Scanning rests this long on each control before moving on. */}
              {profile.motor_accessibility_preset === "scan" ? (
                <label>
                  <span>Scan step (ms)</span>
                  <input
                    max={3000}
                    min={600}
                    onChange={(event) => onUpdateProfile(profile.id, { scan_period_ms: Number(event.target.value) })}
                    step={100}
                    type="number"
                    value={profile.scan_period_ms}
                  />
                </label>
              ) : null}
              <label className="builder-profile-check">
                <input
                  checked={profile.dwell_enabled}
                  onChange={(event) => onUpdateProfile(profile.id, { dwell_enabled: event.target.checked })}
                  type="checkbox"
                />
                <span>Resting on a control presses it</span>
              </label>
              {profile.dwell_enabled ? (
                <label>
                  <span>Rest for (ms)</span>
                  <input
                    max={4000}
                    min={400}
                    onChange={(event) => onUpdateProfile(profile.id, { dwell_ms: Number(event.target.value) })}
                    step={100}
                    type="number"
                    value={profile.dwell_ms}
                  />
                </label>
              ) : null}
              <label className="builder-profile-check">
                <input
                  checked={profile.audio_cues}
                  onChange={(event) => onUpdateProfile(profile.id, { audio_cues: event.target.checked })}
                  type="checkbox"
                />
                <span>Sound on stop and link loss</span>
              </label>
            </div>

            <div className="builder-profile-actions">
              <span className="builder-profile-id">{profile.id}</span>
              <button className="builder-secondary-action" onClick={() => onRemoveProfile(profile.id)} type="button">
                Remove role
              </button>
            </div>
          </li>
        ))}
      </ul>

      <button className="builder-secondary-action" onClick={onAddProfile} type="button">
        Add a role
      </button>
    </section>
  );
}
