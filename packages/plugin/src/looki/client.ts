import { buildLookiUrl } from "./base-url.js";

export type LookiEventEnvelope = {
  id: string; // logical event id (from server-side build_event)
  created_at_ms: number;
  /**
   * Dispatch hint from the server (NOT business data):
   *   true  → route through the OpenClaw agent, then forward the agent's reply
   *   false → forward the event text directly to downstream channels, skip agent
   * Default true for safety — an older/unupdated server will omit this field
   * and we want to keep the current behavior for it.
   */
  ai_revise?: boolean;
  data: Record<string, unknown>;
};

export type GetUpdatesResponse = {
  ret: number;
  events: LookiEventEnvelope[];
  poll_timed_out: boolean;
  heartbeat_at_ms: number;
  subscription_id: string;
};

export type GetUpdatesParams = {
  baseUrl: string; // e.g. http://localhost:9001/message-channel
  /** Looki user API key (e.g. "lk-..."). Server resolves the user + their
   *  active subscription from this alone — no sub-id required. */
  apiKey: string;
  timeoutMs: number;
  maxEvents: number;
  heartbeatAtMs: number;
};

/**
 * Long-poll the Looki events API. The server may hold the request up to
 * `timeoutMs` before returning an empty response with `poll_timed_out: true`;
 * callers simply poll again.
 *
 * Throws on non-2xx. A 409 (poll_in_flight) means another poller on the
 * same subscription is already active — caller should back off.
 */
export async function getUpdates(params: GetUpdatesParams): Promise<GetUpdatesResponse> {
  const url = buildLookiUrl(params.baseUrl, "getupdates");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-API-Key": params.apiKey,
  };

  const controller = new AbortController();
  // Client-side abort is the server's long-poll window plus a 5s grace period,
  // so the server has time to flush its "poll_timed_out" response before we
  // cut the socket. Aborting exactly at timeoutMs would race the server and
  // surface as a spurious network error.
  const t = setTimeout(() => controller.abort(), params.timeoutMs + 5_000);

  try {
    const res = await fetch(url.toString(), {
      method: "POST",
      headers,
      body: JSON.stringify({
        timeout_ms: params.timeoutMs,
        max_events: params.maxEvents,
        heartbeat_at_ms: params.heartbeatAtMs,
      }),
      signal: controller.signal,
    });
    const rawText = await res.text();
    if (!res.ok) {
      const err = new Error(`getUpdates ${res.status}: ${rawText}`) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    return JSON.parse(rawText) as GetUpdatesResponse;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return {
        ret: 0,
        events: [],
        poll_timed_out: true,
        heartbeat_at_ms: params.heartbeatAtMs,
        subscription_id: "",
      };
    }
    throw err;
  } finally {
    clearTimeout(t);
  }
}
