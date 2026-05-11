// Three patterns because a credential can leak in three shapes; the bare
// `lk-...` pattern alone isn't enough because non-lk tokens (Bearer, custom
// X-API-Key values) also need redacting:
//   - BEARER:           Authorization: Bearer <any-token>
//   - X_API_KEY_HEADER: X-API-Key: <any-token>
//   - API_KEY:          bare "lk-..." anywhere (URL path, error body, dumps)
const API_KEY_PATTERN = /\blk-[A-Za-z0-9_-]+/g;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const X_API_KEY_HEADER_PATTERN = /(X-API-Key[^A-Za-z0-9]+)[A-Za-z0-9._~+/=-]+/gi;

export function sanitizeLogMessage(message: string): string {
  return message
    .replace(BEARER_PATTERN, "Bearer [redacted]")
    .replace(X_API_KEY_HEADER_PATTERN, "$1[redacted]")
    .replace(API_KEY_PATTERN, "lk-[redacted]");
}
