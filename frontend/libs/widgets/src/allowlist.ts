/** The backend's `allowlist_grants`: `*`, an exact match, or an entry ending in "/" granting its namespace. */
export function allowlistAllows(allowlist: readonly string[], value: string): boolean {
  return allowlist.some(
    (entry) => entry === "*" || entry === value || (entry.endsWith("/") && entry !== "/" && value.startsWith(entry)),
  );
}
