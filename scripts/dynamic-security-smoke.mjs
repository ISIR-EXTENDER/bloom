import assert from "node:assert/strict";

const baseUrl = process.env.BLOOM_SECURITY_SCAN_BASE_URL ?? "http://127.0.0.1:8000";
const apiKey = process.env.BLOOM_SECURITY_SCAN_API_KEY ?? "";
const allowedOrigin = process.env.BLOOM_SECURITY_SCAN_ORIGIN ?? "http://localhost:5173";

const apiHeaders = apiKey ? { "X-Bloom-API-Key": apiKey } : {};

async function main() {
  const healthResponse = await fetch(`${baseUrl}/api/v1/health`, { headers: apiHeaders });
  assert.equal(healthResponse.status, 200, "health endpoint should be reachable");
  assertSecurityHeaders(healthResponse);

  const openApiResponse = await fetch(`${baseUrl}/openapi.json`, { headers: apiHeaders });
  assert.equal(openApiResponse.status, 200, "OpenAPI schema should be reachable for scanner checks");
  assertSecurityHeaders(openApiResponse);

  const preflightResponse = await fetch(`${baseUrl}/api/v1/health`, {
    headers: {
      "Access-Control-Request-Method": "GET",
      Origin: allowedOrigin,
      ...apiHeaders,
    },
    method: "OPTIONS",
  });
  assert.equal(preflightResponse.status, 200, "configured CORS preflight should be accepted");
  assert.equal(
    preflightResponse.headers.get("access-control-allow-origin"),
    allowedOrigin,
    "CORS response should echo only the configured origin",
  );

  console.log(`Dynamic security smoke passed against ${baseUrl}`);
}

function assertSecurityHeaders(response) {
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.match(response.headers.get("permissions-policy") ?? "", /camera=\(self\)/);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
