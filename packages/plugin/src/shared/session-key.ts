export type ForwardPeerKind = "direct" | "group";

export type ParsedSessionKey = {
  agentId?: string;
  channel?: string;
  peerKind: ForwardPeerKind;
  peerId: string;
};

export type SessionKeyParseResult =
  | { ok: true; value: ParsedSessionKey }
  | { ok: false; error: string };

/**
 * Parse openclaw session keys of shape `agent:<agentId>:<channel>:<kind>:<peerId...>`.
 * `<peerId>` may itself contain `:` segments (e.g. `looki:account:default`),
 * so everything from index 4 onward is rejoined.
 */
export function parseSessionKeyDetailed(sessionKey: string): SessionKeyParseResult {
  const parts = sessionKey.split(":");
  const agentId = parts[1] || undefined;
  const channel = parts[2] || undefined;
  const rawKind = parts[3]?.toLowerCase();
  const peerId = parts.slice(4).join(":");
  if (parts[0] !== "agent") {
    return { ok: false, error: "expected prefix 'agent'" };
  }
  if (!channel) {
    return { ok: false, error: "missing channel segment" };
  }
  if (!peerId) {
    return { ok: false, error: "missing peer id segment" };
  }
  if (rawKind === "direct")
    return { ok: true, value: { agentId, channel, peerKind: "direct", peerId } };
  if (rawKind === "group" || rawKind === "channel")
    return { ok: true, value: { agentId, channel, peerKind: "group", peerId } };
  return {
    ok: false,
    error: `unsupported conversation kind '${rawKind ?? "<missing>"}'`,
  };
}

export function parseSessionKey(sessionKey: string): ParsedSessionKey | undefined {
  const result = parseSessionKeyDetailed(sessionKey);
  return result.ok ? result.value : undefined;
}
