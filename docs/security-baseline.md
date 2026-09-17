# Bloom Security Baseline

Bloom is not a safety-certified control system. It is the active Extender IHM and can trigger robot behavior, so the
minimum security posture must be stronger than a generic internal dashboard.

This baseline is intentionally small and practical. It distinguishes controls enforced now from deployment work that
still depends on the environment.

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
- Require one runtime control owner in production. Gate teleop and robot-facing HTTP operations with the same opaque
  WebSocket session lease, while keeping STOP callable without ownership.
- Restrict CORS to configured dashboard origins.
- Apply a global HTTP rate limit, plus runtime command-specific rate limits for robot commands. A command is checked
  against the allowlist before it is counted, so a topic nobody may publish to never gets a counter, and idle counters
  are swept once either map fills.
- Enforce deployment allowlists for publish topics, message types, teleop targets, command frames, service calls,
  recording topics, and recording folders, with narrower app policy as an earlier guardrail. The runtime socket
  applies the same narrowing once a session names the app it is running.
- Validate manager mode grammar and reject malformed/unknown frame requests before they reach ROS.
- Audit accepted and rejected runtime command attempts.
- Keep file paths controlled by repositories/services, never by raw user-provided paths.
- Keep dependency lock files committed.
- Run dependency audits through `npm run audit:security` before deployment-oriented releases.
- Run the basic dynamic smoke scan through `npm run security:dynamic` against a running backend before deployment-oriented
  releases.
- Keep tests independent from ROS by injecting adapters/gateways.

## Remaining Deployment Controls

- User-facing dashboard login/session UX if Bloom is deployed beyond trusted lab devices.
- Stronger authorization policy per app/workspace once profiles and projects exist.
- CSRF protection or same-site cookie strategy if browser-authenticated sessions are used.
- Define persistent audit retention/export if in-memory runtime audit is not sufficient for the deployment.
- SROS2 deployment notes for secure ROS graph communication.
- Security CI checks: scheduled dependency audits, secret scanning, and a ZAP baseline scan.

## API Perimeter Configuration

Local development keeps authentication disabled by default. Staging and production deployments should configure:

```bash
export BLOOM_AUTH_ENABLED=true
export BLOOM_ADMIN_API_KEY='replace-with-admin-secret'
export BLOOM_OPERATOR_API_KEY='replace-with-operator-secret'
export BLOOM_OBSERVER_API_KEY='replace-with-observer-secret'
export BLOOM_CORS_ALLOWED_ORIGINS='http://tablet.local:5173,http://dashboard.local:5173'
export BLOOM_HTTP_RATE_LIMIT_PER_MINUTE=600
export BLOOM_RUNTIME_CONTROL_REQUIRED=true
```

In production Bloom refuses to start unless every key is at least 32 characters and differs from the other roles' keys,
since a key shared by two roles grants the stronger one, and unless the origins are explicit rather than `*`. Generate
keys with `python3 -c "import secrets; print(secrets.token_urlsafe(32))"`.

`BLOOM_CORS_ALLOWED_ORIGINS` also governs the runtime WebSocket. CORS never applies to a WebSocket handshake, so Bloom checks the `Origin` itself and refuses a browser page from any origin not on the list. A client that sends no `Origin` is not a browser page and is not refused on those grounds; it still needs a key when auth is on.

Requests use the `X-Bloom-API-Key` header. Runtime WebSocket clients can use the same header, or offer the subprotocols
`bloom.runtime.v1` and `bloom.api-key.<key>` when they cannot set headers, as browsers cannot. The `api_key` query
parameter remains a last fallback for a key that is not a valid subprotocol token; Bloom redacts it from the Uvicorn log,
but a proxy in front may still record it.

Three roles exist. Admin edits configuration, operator commands the robot, and observer may only read: saved apps,
runtime control state, the STOP latch, the audit log, saved positions, and the ROS topic catalog. An observer may open
the runtime WebSocket, because live status and topic samples are what a supervisor mirror is for, but the server refuses
its teleop commands and its attempts to claim or release control. Observer is enforced on the server, not by hiding
buttons, so a supervisor screen can be given a key that cannot take the arm.

A runtime session id proves ownership of the lease on HTTP, so it is never shown to anyone else. The audit log lists
each session as a stable alias that correlates records without revealing the id.

The dashboard reads its key from `VITE_BLOOM_API_KEY` at build time and sends it on every HTTP call. A browser cannot
set headers on a WebSocket handshake, so the runtime socket offers the key as a subprotocol instead. Either way the key
crosses the network in clear, which is why an authenticated deployment should terminate TLS in front of Bloom.
Leave the variable unset for local development, where the backend runs without keys.

After connecting, the dashboard receives an opaque runtime session ID and sends it as `X-Bloom-Runtime-Session` on
robot-facing HTTP calls. This is a short-lived control lease, not authentication and not a replacement for the API key.
The backend never exposes the owner's session ID to observers. Release enters a command-blocking state before final
neutralization, preventing a request that passed an earlier check from racing past handover.

## Minimum Security Tests

- API rejects invalid configuration shapes with clear 4xx responses.
- API rejects path traversal or unknown configuration IDs.
- App/screen membership cannot mutate another app unexpectedly.
- ROS publish, teleop, service, frame, and recording endpoints reject requests outside configured policy.
- WebSocket sessions reject unknown actions and handle disconnects cleanly.
- Two runtime sessions cannot command concurrently; release blocks new work until tracked motion is neutralized, and a
  failed neutralization latches STOP before the lease disappears.
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
