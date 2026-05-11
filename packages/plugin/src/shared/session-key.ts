export type ForwardPeerKind = "direct" | "group";

export type ParsedSessionKey = {
  agentId?: string;
  channel?: string;
  peerKind: ForwardPeerKind;
  peerId: string;
};

/**
 * Parse openclaw session keys of shape `agent:<agentId>:<channel>:<kind>:<peerId...>`.
 * `<peerId>` may itself contain `:` segments (e.g. `looki:account:default`),
 * so everything from index 4 onward is rejoined.
 */
export function parseSessionKey(sessionKey: string): ParsedSessionKey | undefined {
  const parts = sessionKey.split(":");
  const agentId = parts[1] || undefined;
  const channel = parts[2] || undefined;
  const rawKind = parts[3]?.toLowerCase();
  const peerId = parts.slice(4).join(":");
  if (!peerId) return undefined;
  if (rawKind === "direct") return { agentId, channel, peerKind: "direct", peerId };
  if (rawKind === "group" || rawKind === "channel")
    return { agentId, channel, peerKind: "group", peerId };
  return undefined;
}
