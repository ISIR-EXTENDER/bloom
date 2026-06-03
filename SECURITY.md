# Security Policy

Bloom is a web interface for robot teleoperation, supervision, and configurable
device control. Security reports are important because UI actions may eventually
reach real robots, ROS topics, cameras, logs, or machine-control adapters.

## Supported Versions

Bloom is currently in active migration and foundation development. Security
fixes are handled on `main`.

| Version | Supported |
| --- | --- |
| `main` | yes |
| feature branches | no |

## Reporting A Vulnerability

Please do not publish exploit details in a public issue.

Preferred reporting path:

1. Use GitHub private vulnerability reporting if it is enabled for this
   repository.
2. If private reporting is not available, contact a repository maintainer with a
   short description and reproduction steps.
3. If you must open a public issue, keep it high level and avoid sharing
   payloads, tokens, robot addresses, or exploit details.

Useful information to include:

- affected area: frontend, backend API, SQLite storage, ROS adapter, runtime
  session, topic publishing, camera, or build tooling;
- reproduction steps using a local/dev setup when possible;
- expected impact;
- whether the issue can reach a robot command, file write, network request, or
  sensitive data.

## Security Baseline

Bloom tracks its minimum security posture in
[`docs/security-baseline.md`](docs/security-baseline.md). Robot-facing changes
should keep ROS-specific behavior behind backend adapters and should not expose
unrestricted topics, message types, payloads, or output folders.

## Response Expectations

Maintainers should acknowledge credible reports as soon as practical, triage
impact, prepare a fix or mitigation, and document any follow-up hardening work.
