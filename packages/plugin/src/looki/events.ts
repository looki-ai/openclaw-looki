import type { LookiEventEnvelope } from "./client.js";

export type LookiMsgContext = {
  Body: string;
  BodyForAgent: string;
  RawBody: string;
  CommandBody: string;
  From: string;
  To: string;
  AccountId: string;
  Provider: "openclaw-looki";
  Surface: "openclaw-looki";
  OriginatingChannel: "openclaw-looki";
  OriginatingTo: string;
  ChatType: "direct";
  MessageSid: string;
  Timestamp: number;
  SessionKey?: string;
};

// Pick a single human-readable string for the agent / downstream forwarders.
// Looki events carry multiple semi-redundant fields depending on event kind;
// we prefer the richest one and fall back through lighter summaries. The
// final JSON fallback is load-bearing for the ai_revise=false bypass path —
// downstream channels still need *something* to send even for structured
// events that have none of these fields populated.
export function resolveAgentText(event: LookiEventEnvelope): string {
  const candidates: unknown[] = [
    event.data?.text,
    event.data?.title,
    event.data?.summary,
    event.data?.description,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c;
  }
  return JSON.stringify(event.data ?? {});
}

export function lookiEventToMsgContext(
  event: LookiEventEnvelope,
  accountId: string,
): LookiMsgContext {
  // Looki events are account-scoped, not per-conversation, so we synthesize
  // a stable pseudo-peer from accountId to keep session routing deterministic.
  const peer = `looki:account:${encodeURIComponent(accountId.trim() || "default")}`;
  const agentText = resolveAgentText(event);

  return {
    Body: agentText,
    BodyForAgent: agentText,
    RawBody: agentText,
    CommandBody: agentText,
    From: peer,
    To: peer,
    AccountId: accountId,
    Provider: "openclaw-looki",
    Surface: "openclaw-looki",
    OriginatingChannel: "openclaw-looki",
    OriginatingTo: peer,
    ChatType: "direct",
    MessageSid: event.id,
    Timestamp: event.created_at_ms,
  };
}
