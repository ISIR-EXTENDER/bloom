# Bloom Security Baseline

Bloom is not a safety-certified control system. It is a web interface that can eventually trigger robot behavior, so the
minimum security posture must be stronger than a generic internal dashboard.

This baseline is intentionally small and practical. It defines what Bloom should start enforcing now and what every
future migration slice should keep in mind.

## Reference Benchmark

- [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/) is the main verification
  checklist for web application controls.
- [OWASP API Security Top 10 2023](https://owasp.org/API-Security/editions/2023/en/0x00-header/) is the main API
  threat model reference.
- [NIST SSDF SP 800-218](https://csrc.nist.gov/pubs/sp/800/218/final) is the secure development process reference.
- [ROS 2 Security](https://docs.ros.org/en/humble/Tutorials/Advanced/Security/Security-Main.html) and SROS2 are the
  reference for robot communication authentication, encryption, and access control.
- [OWASP ZAP Baseline](https://www.zaproxy.org/docs/docker/baseline-scan/) is a lightweight dynamic scan suitable for CI
  once the app has a stable local preview target.
- [Dependabot alerts](https://docs.github.com/en/code-security/concepts/supply-chain-security/about-dependabot-alerts),
  `npm audit`, and Python dependency auditing are the minimum supply-chain checks.

## Bloom Threat Model

The first things to protect are:

- Robot commands: avoid accidental or unauthorized publishing to sensitive ROS topics.
- Configuration data: prevent malicious payloads, path traversal, broken app/screen ownership, and unsafe imports.
- Runtime sessions: prevent arbitrary clients from subscribing, publishing, or flooding commands.
- Dependency chain: keep frontend, backend, and GitHub Actions dependencies visible and updateable.
- Local lab deployment: assume tablet/browser users are trusted operators, but not every process on the network is.

## Minimum Controls To Keep Now

- Validate every app, screen, widget, ROS topic, message type, and payload through typed backend and frontend models.
- Keep ROS access behind backend adapters; generic frontend code should emit intents, not talk to ROS directly.
- Keep SQLite as the source of truth and JSON import/export as an explicit migration path, not silent filesystem sync.
- Add HTTP security headers on every backend response.
- Keep file paths controlled by repositories/services, never by raw user-provided paths.
- Keep dependency lock files committed.
- Keep tests independent from ROS by injecting adapters/gateways.

## Controls To Add Before Real Robot Deployment

- Authentication for the dashboard and API.
- Authorization for robot actions, with at least operator/admin roles.
- Explicit allowlists for publishable ROS topics, message types, and payload schemas.
- CSRF protection or same-site cookie strategy if browser-authenticated sessions are used.
- CORS restricted to the expected frontend origins.
- Rate limits for command endpoints and runtime WebSocket messages.
- Audit log for app config changes and robot command intents.
- SROS2 deployment notes for secure ROS graph communication.
- Security CI checks: dependency audits, secret scanning, and a ZAP baseline scan.

## Minimum Security Tests

- API rejects invalid configuration shapes with clear 4xx responses.
- API rejects path traversal or unknown configuration IDs.
- App/screen membership cannot mutate another app unexpectedly.
- ROS publish endpoints reject unknown topics, message types, and malformed payloads once allowlists exist.
- WebSocket sessions reject unknown actions and handle disconnects cleanly.
- HTTP responses include minimal security headers.
- Dependency checks run regularly in CI or before releases.
- ZAP baseline runs against a local preview once the dashboard routes are stable enough.

## Notes For ROS Features

ROS topic publish widgets are powerful and should stay configurable, but not unbounded. The safe default should be:

- UI config selects from known message templates and approved topics.
- Advanced/raw payload mode is explicit and visible.
- The backend validates and logs the final command intent before reaching ROS.
- Dangerous topics can be disabled per deployment.

This keeps Bloom useful for non-web users while making robot control auditable and reversible.
