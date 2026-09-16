# Same-Wi-Fi Development Validation - 2026-09-16

## Scope

Bloom's Extender launcher, Vite API/WebSocket proxy, LAN-facing dashboard URL, and the shared SQLite behavior used when
phones or tablets connect to one host on the same trusted Wi-Fi network.

## Contract

- FastAPI remains on `127.0.0.1` by default.
- `BLOOM_FRONTEND_HOST=0.0.0.0` exposes Vite on the host's interfaces.
- Vite proxies same-origin `/api` traffic to `BLOOM_API_PROXY_TARGET`, which the launcher derives from
  `BLOOM_API_PORT` instead of assuming port `8000`.
- The launcher prints a usable LAN URL from `BLOOM_PUBLIC_HOST` or the first `hostname -I` address and warns that the
  proxied API is reachable through the development server.
- Every browser uses the API's one `backend/data/bloom.db`; JSON remains import/export and source-controlled seed data,
  not per-browser state.

## Verification

Run syntax, build, loopback proxy, and LAN-address checks with the existing API left running:

```bash
bash -n scripts/extender-workspace-dev.sh
npm run build --workspace @bloom/dashboard
VITE_BLOOM_API_PROXY_TARGET=http://127.0.0.1:8000 \
  npm run dev --workspace @bloom/dashboard -- --host 0.0.0.0 --port 5180 --strictPort
curl -fsS http://127.0.0.1:5180/api/v1/health
curl -fsS http://<host-lan-ip>:5180/api/v1/health
```

The host reported `192.168.0.191`. Both `/` and `/api/v1/health` returned HTTP 200 through `127.0.0.1:5180` and
`192.168.0.191:5180`. A Playwright run then used the LAN URL and captured `01-runtime-ready`; Explorer reached its
`READY` state, exercising configuration HTTP and the runtime WebSocket through the proxy. The temporary Vite process
was stopped afterward. The existing API on `8000`, dashboard on `5173`, ROS graph, and `backend/data` store were not
restarted or replaced.

## Not Proven

A same-host LAN-IP request proves bind and proxy behavior but not a particular phone, access point, client isolation
policy, or firewall. The Vite recipe is not an internet deployment and does not add a browser API-key sign-in flow.
