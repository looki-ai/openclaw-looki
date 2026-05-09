export type LookiForwardPeerKind = "direct" | "group";

export type LookiForwardTarget = {
  /** Target channel id, e.g. "feishu". */
  channel: string;
  /** Target account id in the destination channel. */
  accountId?: string;
  /** Recipient in the destination channel (e.g. open_id for Feishu/Lark, or group chat id). */
  to: string;
  /** OpenClaw session key selected during setup. Used to derive direct/group. */
  sessionKey: string;
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
    const sessionKey =
      typeof maybeTarget.sessionKey === "string" && maybeTarget.sessionKey.trim()
        ? maybeTarget.sessionKey.trim()
        : undefined;

    if (!channel || !to || !sessionKey) continue;
    targets.push({ channel, to, accountId, sessionKey });
  }

  return targets;
}
