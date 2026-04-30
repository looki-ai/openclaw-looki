/**
 * Looki exposes two upstream shapes:
 *   - prod   (https://open.looki.ai)   channel under /message-channel/   tools under /api/v1/
 *   - local  (http://127.0.0.1:9001)   channel under /message-channel/   tools under /agents/
 *
 * We pick the tool prefix by hostname so the user only ever configures a single
 * `channels.openclaw-looki.baseUrl` and both the getupdates poller and the
 * memory tool target the correct upstream paths.
 */

const LOCAL_HOST_PATTERN = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|::1|\[::1\]|\d+\.\d+\.\d+\.\d+)$/;

function ensureTrailingSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}

function isLocalHost(hostname: string): boolean {
  if (!hostname) return false;
  if (LOCAL_HOST_PATTERN.test(hostname)) return true;
  // local LAN suffixes that are never published prod Looki endpoints
  return (
    hostname.endsWith(".local") ||
    hostname.endsWith(".lan") ||
    hostname.endsWith(".internal")
  );
}

export type LookiEndpointKind = "channel" | "tool";

function getPrefix(hostname: string, kind: LookiEndpointKind): string {
  if (kind === "channel") return "message-channel";
  return isLocalHost(hostname) ? "agents" : "api/v1";
}

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
  let hostname = "";
  try {
    hostname = new URL(normalized).hostname;
  } catch {
    // fall through — prod prefix
  }
  const prefix = getPrefix(hostname, kind);
  const root = ensureTrailingSlash(`${normalized}/${prefix}`);
  return new URL(path, root);
}
