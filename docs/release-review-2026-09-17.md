# Release review — 2026-09-17

A pre-release review of `main` at `95dd4d3`, in five areas reviewed in parallel: backend runtime safety, backend
configuration and storage, the dashboard runtime, widgets and the builder, and release engineering. Every finding
below was verified against the code, and most were reproduced with a throwaway test or script. Duplicates found by
more than one reviewer are merged.

A live bench against `cartesian_manager` passed all 17 checks before any fix: teleop reaches `/cartesian_command`,
release and the 0.2 s input timeout return the output to zero, an unknown frame is refused, STOP publishes the zero
twist and `behaviour/passthrough`, teleop is refused while stopped, the owner resumes, and dropping the socket
mid-motion neutralizes the arm.

Fixes land one group per commit, in the order below. Update the status column as each lands.

## A. Unintended robot motion

| # | Finding | Where | Status |
| --- | --- | --- | --- |
| A1 | The 15 s attention timeouts on stepped/latched sliders and joysticks and on latched momentary buttons are effects without dependencies, so every render restarts them. Scanning, telemetry and status polls re-render constantly, so a held value never expires. | `widget-renderers/control-renderers.tsx`, `action-renderers.tsx` | Fixed |
| A2 | A latched momentary button (Hold snake) never publishes its release when it unmounts (Settings, screen change) or becomes disabled, so the manager stays in snake mode. | `action-renderers.tsx` | Fixed |
| A3 | Losing control ownership does not suspend teleop, and release zeros are blocked by the ownership gate, so after a reconnect and reclaim the pump streams a joystick value the operator already released. | `RuntimeWorkspace.tsx`, `use-runtime-action-dispatcher.ts` | Fixed |
| A4 | STOP and Resume render the same `<button>` node, so a dwell rest that started on STOP completes as a Resume about one second after STOP was pressed. | `RuntimeStopControl.tsx`, `use-dwell-activation.ts` | Fixed |
| A5 | Switch scanning and dwell stay active behind the Maintenance dialog; a switch press on the dialog fires the covered canvas control. | `RuntimeWorkspace.tsx`, `use-switch-scanning.ts` | Fixed |
| A6 | A ROS service call runs inside the STOP lock for up to 4 s, so STOP waits for it; WebSocket teleop takes that lock on the event loop, freezing every socket and HTTP response meanwhile. | `sessions/stop.py`, `routes/ros.py`, `routes/runtime.py` | Fixed |
| A7 | STOP goes through the HTTP rate limiter and is refused with 429 once a client IP's budget is spent. | `apps/bloom_api/security.py` | Fixed |
| A8 | The runtime WebSocket never checks `Origin`, and auth is off in the lab launcher, so any web page in a browser that can reach the API can claim control and send teleop. | `routes/runtime.py` | Fixed |
| A9 | Kinova seed values that belong to Explorer: the gripper toggles send `[1.1]`/`[0.2]`, outside the Robotiq 85 range, and the Joystick Lab gripper labels are inverted; the upstream Kinova `home` joint target is Explorer's six-joint pose. | `seed/applications/kinova-manager.json` | Fixed |
| A10 | Step and latch widgets keep their held vector or value across STOP, blur and loss of control, so the next tap jumps from the stale value; a latched joystick's Zero leaves the pad's own vector stale. | `control-renderers.tsx`, `JoystickPrimitive.tsx` | Fixed |
| A11 | On a return-to-center slider, Home, End, PageUp and PageDown send a full-scale value that stays held until focus leaves. | `control-renderers.tsx` | Fixed |
| A12 | A joystick with `zero_on_release: false` in the default preset has no Zero control and no attention timeout. | `control-renderers.tsx` | Fixed |
| A13 | The joystick normalizer replaces an authored `runtime_binding` whose target is `both` with the defaults, discarding `axis_mapping`, `axis_deadzone` and the frame. No shipped app is affected; any app authored with a custom mapping is. | `widgets/settings.ts` | Fixed |

## B. Security and broken features

| # | Finding | Where | Status |
| --- | --- | --- | --- |
| B1 | The audit log returns the owner's `session_id` to any observer, and that id alone proves ownership on HTTP, so another tablet can resume STOP or dispatch actions under the owner's lease. | `routes/runtime.py`, `security.py` | Fixed |
| B2 | The observer key gets 403 on every configuration read, so a supervisor build with it cannot open an app. | `routes/configurations.py` | Fixed |
| B3 | Production accepts short or equal admin/operator/observer keys (an observer key equal to the operator key can drive) and a `*` CORS origin. | `settings.py` | Fixed |
| B4 | The WebSocket API key travels in the query string and lands in the access log. | `security.py`, `runtime-websocket-client.ts` | Open |
| B5 | Camera frames are published while STOP is engaged; on the legacy `teleop_command` backend STOP zeros the manager topic instead of `/teleop_cmd`. | `routes/runtime.py`, `sessions/stop.py`, `main.py` | Open |
| B6 | `config status` overwrites its id sets inside the loop and reports every app after the first as missing; importing the API module to run any CLI command seeds and upgrades the default store first. | `bloom_cli/main.py`, `bloom_api/main.py` | Open |
| B7 | Seed upgrades stall: the fingerprint hashes default values, so any new model field makes every unedited copy look edited; stores seeded before stamps existed never upgrade; publish leaves a stale stamp; import keeps one; one unreadable stored bundle stops the API from starting. | `config/seed.py`, `bloom_cli/main.py` | Open |
| B8 | The WebSocket client matches replies by message type, so an error for one request rejects another and some promises never settle; a late close from an old socket tears down its replacement; telemetry subscribes three times per connection with unhandled rejections. | `runtime-websocket-client.ts`, `RuntimeWorkspace.tsx`, `use-runtime-action-dispatcher.ts` | Open |

## C. Degraded behavior

| # | Finding | Where | Status |
| --- | --- | --- | --- |
| C1 | The supervisor mirror keeps showing motion and the old frame during STOP, misses mode requests the shipped buttons publish, records one-shot joint targets as lasting modes, and shows the configured frame when an idle operator chose another. | `sessions/manager.py`, `routes/ros.py`, `SupervisorWorkspace.tsx` | Open |
| C2 | Position libraries are created on read for any id pair and never bounded, subscriptions per socket are unbounded, and per-message teleop auditing turns the 500-record audit log over in about 17 s. | `routes/runtime.py`, `sessions/audit.py`, `teleop_runtime.py` | Open |
| C3 | Store edge cases: CLI commands skip adopting the old file store, deleting a shipped configuration is undone on restart, concurrent saves to one configuration lose an edit, and publishing an unedited app rewrites its seed file. | `config/*`, `routes/configurations.py` | Open |
| C4 | Builder: JSON fields revert every keystroke that leaves the JSON invalid; a topic echo stays blank after Clear on a full buffer; an emptied number field stores 0 and `step: 0` passes validation. | `builder/*`, `debug-renderers.tsx`, `widgets/settings.ts` | Open |
| C5 | The launcher leaves Vite running when it exits and lets it drift to another port; Node checks compare only the major version; the workspace path is hard-coded to one user. | `scripts/extender-workspace-dev.sh`, `scripts/verify.sh` | Open |
| C6 | CI does not run the contract validations or the version check, `verify` omits the dynamic security smoke, the coherence check skips Kinova, and the workflow has no `permissions` block. | `.github/workflows/ci.yml`, `scripts/*` | Open |

## D. Release documentation

| # | Finding | Where | Status |
| --- | --- | --- | --- |
| D1 | `CHANGELOG.md` omits the breaking and security changes of the last two days: the Node 24 floor, the narrowed frame allowlist, the observer role and API keys, per-app positions, seed auto-upgrade, and ownership on by default. | `CHANGELOG.md` | Open |
| D2 | Docs describe behavior the code does not have: the default frame list, positions replay/rename and persistence, superseded ADRs 0122 and 0128, no ADR for the observer role, `config status` labels, undocumented settings, a version check covering three of eight carriers, and hard-coded English runtime strings. | `docs/*`, `README.md` | Open |
| D3 | Version and tag: an untagged `[0.1.0]` section already exists, so this release is either 0.1.0 with that section folded in, or 0.2.0. | `CHANGELOG.md`, version carriers | Needs a decision |

## Decisions recorded while fixing

Add each decision here with its reason when a fix involves a trade-off.

- **A6, WebSocket commands stay on the event loop.** Moving every WebSocket message onto a worker thread was tried and
  rejected. It made the disconnect neutralization lose a race with handler cancellation under the test client: in some
  runs the cleanup that latches STOP never started. What froze the loop was teleop waiting on a STOP gate held by a
  slow service call, and service calls now run outside the gate, so no slow operation holds it any more. Separately,
  `run_runtime_thread` now hands its work to a thread before its first await, so safety cleanup starts even when the
  handler is cancelled immediately.
