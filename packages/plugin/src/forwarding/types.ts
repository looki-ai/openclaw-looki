export type LookiForwardPeerKind = "direct" | "group";

export type LookiForwardTarget = {
  /** Target channel id, e.g. "feishu". */
  channel: string;
  /** Target account id in the destination channel. */
  accountId?: string;
  /** Recipient in the destination channel (e.g. open_id for Feishu/Lark, or group chat id). */
  to: string;
  /** Whether `to` refers to a direct chat or a group. Defaults to "direct". */
  peerKind?: LookiForwardPeerKind;
};

export function normalizeForwardTargets(value: unknown): LookiForwardTarget[] {
  if (!value) return [];

  const rawTargets = Array.isArray(value) ? value : [value];
  const targets: LookiForwardTarget[] = [];

  for (const raw of rawTargets) {
    if (!raw || typeof raw !== "object") continue;
    const maybeTarget = raw as Partial<LookiForwardTarget>;
    const channel = typeof maybeTarget.channel === "string" ? maybeTarget.channel.trim() : "";
    const to = typeof maybeTarget.to === "string" ? maybeTarget.to.trim() : "";
    const accountId =
      typeof maybeTarget.accountId === "string" && maybeTarget.accountId.trim()
        ? maybeTarget.accountId.trim()
        : undefined;
    const peerKind: LookiForwardPeerKind | undefined =
      maybeTarget.peerKind === "group" || maybeTarget.peerKind === "direct"
        ? maybeTarget.peerKind
        : undefined;

    if (!channel || !to) continue;
    targets.push({ channel, to, accountId, peerKind });
  }

  return targets;
}
