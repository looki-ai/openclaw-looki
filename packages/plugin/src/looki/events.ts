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

function resolveStablePeer(accountId: string): string {
  const normalizedAccountId = accountId.trim() || "default";
  return `looki:account:${encodeURIComponent(normalizedAccountId)}`;
}

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
  const peer = resolveStablePeer(accountId);
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
