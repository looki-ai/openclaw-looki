/**
 * Looki upstream shape (unified):
 *   - channel under /message-channel/
 *   - tools   under /api/v1/
 *
 * The user configures a single `channels.openclaw-looki.baseUrl`; both the
 * getupdates poller and the memory/task tools append the kind-specific
 * prefix at request time.
 */

export type LookiEndpointKind = "channel" | "tool";

const ENDPOINT_PREFIX: Record<LookiEndpointKind, string> = {
  channel: "message-channel",
  tool: "api/v1",
};

/**
 * Strip any trailing slash and any legacy path (e.g. an older config that
 * included `/openclaw-looki` or `/api/v1` in baseUrl). We always rebuild from
 * the host root so adding kind-specific prefix behavior here stays consistent.
 */
const KNOWN_LEGACY_PREFIXES = new Set([
  "/",
  "/message-channel",
  "/openclaw",
  "/openclaw-looki",
  "/api/v1",
  "/agents",
]);
const warnedBaseUrls = new Set<string>();

export function normalizeLookiBaseUrl(rawBaseUrl: string): string {
  const trimmed = rawBaseUrl.trim();
  if (!trimmed) return trimmed;

  try {
    const url = new URL(trimmed);
    const originalPath = url.pathname.replace(/\/$/, "") || "/";
    if (!KNOWN_LEGACY_PREFIXES.has(originalPath) && !warnedBaseUrls.has(trimmed)) {
      warnedBaseUrls.add(trimmed);
      console.warn(
        `[openclaw-looki] baseUrl path "${originalPath}" will be dropped; only the host root is used. ` +
          `If you need a sub-path (e.g. reverse proxy mount), this is not currently supported.`,
      );
    }
    url.pathname = "/";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return trimmed.replace(/\/$/, "");
  }
}

export function buildLookiUrl(
  baseUrl: string,
  path: string,
  kind: LookiEndpointKind = "channel",
): URL {
  const normalized = normalizeLookiBaseUrl(baseUrl);
  // URL resolution treats a root without trailing "/" as a sibling path, so
  // append one before resolving `path` against it.
  const root = `${normalized}/${ENDPOINT_PREFIX[kind]}/`;
  return new URL(path, root);
}
