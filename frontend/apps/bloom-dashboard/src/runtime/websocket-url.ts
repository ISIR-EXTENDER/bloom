/** The socket endpoints behind the API base URL, with the key offered as a subprotocol when it can be. */
export function resolveWebSocketUrl(
  apiBaseUrl: string,
  path: string,
  { origin = globalThis.location?.origin ?? "", apiKey = "", query = {} }: WebSocketUrlOptions = {},
): string {
  const fallback = origin || "http://localhost:8000";
  const url = new URL(apiBaseUrl || fallback, fallback);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = path;
  url.search = "";
  url.hash = "";
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  // Only a key that cannot travel as a subprotocol falls back to the query, which access logs record.
  if (apiKey && !isSubprotocolToken(apiKey)) {
    url.searchParams.set("api_key", apiKey);
  }
  return url.toString();
}

/** A handshake takes no custom headers, but it does carry offered subprotocols. */
export function resolveWebSocketProtocols(apiKey = ""): string[] | undefined {
  return apiKey && isSubprotocolToken(apiKey) ? ["bloom.runtime.v1", `bloom.api-key.${apiKey}`] : undefined;
}

type WebSocketUrlOptions = {
  apiKey?: string;
  origin?: string;
  query?: Record<string, string>;
};

function isSubprotocolToken(value: string): boolean {
  return /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(value);
}
