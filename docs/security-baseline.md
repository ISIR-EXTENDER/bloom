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
- Keep API-key authentication available for staging/production deployments, with admin/operator roles.
- Require authentication for production settings so Bloom does not start an open production API by accident.
- Restrict CORS to configured dashboard origins.
- Apply a global HTTP rate limit, plus runtime command-specific rate limits for robot commands.
- Keep file paths controlled by repositories/services, never by raw user-provided paths.
- Keep dependency lock files committed.
- Run dependency audits through `npm run audit:security` before deployment-oriented releases.
- Run the basic dynamic smoke scan through `npm run security:dynamic` against a running backend before deployment-oriented
  releases.
- Keep tests independent from ROS by injecting adapters/gateways.

## Controls To Add Before Real Robot Deployment

- User-facing dashboard login/session UX if Bloom is deployed beyond trusted lab devices.
- Stronger authorization policy per app/workspace once profiles and projects exist.
- Explicit allowlists for publishable ROS topics, message types, and payload schemas.
- CSRF protection or same-site cookie strategy if browser-authenticated sessions are used.
- Persistent audit log for app config changes and robot command intents.
- SROS2 deployment notes for secure ROS graph communication.
- Security CI checks: scheduled dependency audits, secret scanning, and a ZAP baseline scan.

## API Perimeter Configuration

Local development keeps authentication disabled by default. Staging and production deployments should configure:

```bash
export BLOOM_AUTH_ENABLED=true
export BLOOM_ADMIN_API_KEY='replace-with-admin-secret'
export BLOOM_OPERATOR_API_KEY='replace-with-operator-secret'
export BLOOM_CORS_ALLOWED_ORIGINS='http://tablet.local:5173,http://dashboard.local:5173'
export BLOOM_HTTP_RATE_LIMIT_PER_MINUTE=600
```

Requests use the `X-Bloom-API-Key` header. Runtime WebSocket clients can use the same header, or the `api_key` query
parameter when the WebSocket client cannot set headers. Treat query-string keys as a compatibility fallback because they
are easier to leak in logs.

## Minimum Security Tests

- API rejects invalid configuration shapes with clear 4xx responses.
- API rejects path traversal or unknown configuration IDs.
- App/screen membership cannot mutate another app unexpectedly.
- ROS publish endpoints reject unknown topics, message types, and malformed payloads once allowlists exist.
- WebSocket sessions reject unknown actions and handle disconnects cleanly.
- HTTP responses include minimal security headers.
- Dependency checks run regularly in CI or before releases.
- Basic dynamic smoke verifies security headers, OpenAPI reachability, and configured CORS behavior against a real
  running backend.
- ZAP baseline runs against a local preview once dashboard/backend deployment startup is scriptable end-to-end.

## Notes For ROS Features

ROS topic publish widgets are powerful and should stay configurable, but not unbounded. The safe default should be:

- UI config selects from known message templates and approved topics.
- Advanced/raw payload mode is explicit and visible.
- The backend validates and logs the final command intent before reaching ROS.
- Dangerous topics can be disabled per deployment.

This keeps Bloom useful for non-web users while making robot control auditable and reversible.
