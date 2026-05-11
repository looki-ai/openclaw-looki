import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { CHANNEL_ID } from "./constants.js";
import type { OpenClawConfigShape } from "./config.js";
import { parseSessionKey, type ForwardPeerKind } from "./session-key.js";

export type SupportedForwardPlugin = {
  id: string;
  detectIds: string[];
  label: string;
  channel: string;
  accountId?: string;
};

export const SUPPORTED_FORWARD_PLUGINS: readonly SupportedForwardPlugin[] = [
  {
    id: "whatsapp",
    detectIds: ["whatsapp", "@openclaw/whatsapp"],
    label: "WhatsApp",
    channel: "whatsapp",
    accountId: "default",
  },
  {
    id: "telegram",
    detectIds: ["telegram", "@openclaw/telegram"],
    label: "Telegram",
    channel: "telegram",
    accountId: "default",
  },
  {
    id: "discord",
    detectIds: ["discord", "@openclaw/discord"],
    label: "Discord",
    channel: "discord",
    accountId: "default",
  },
  {
    id: "openclaw-lark",
    detectIds: ["feishu", "openclaw-lark", "@larksuite/openclaw-lark"],
    label: "Lark",
    channel: "feishu",
    accountId: "default",
  },
  {
    id: "openclaw-weixin",
    detectIds: ["openclaw-weixin", "@tencent-weixin/openclaw-weixin"],
    label: "WeChat",
    channel: "openclaw-weixin",
  },
  {
    id: "qqbot",
    detectIds: ["qqbot", "@openclaw/qqbot"],
    label: "QQ Bot",
    channel: "qqbot",
    accountId: "default",
  },
];

export type ForwardDraftMap = Record<string, string>;

export type ForwardDraftTarget = {
  channel: string;
  accountId?: string;
  to: string;
  sessionKey: string;
};

type ExistingForwardEntry = {
  channel?: string;
  accountId?: string;
  to?: string;
  sessionKey?: unknown;
};

/** Forward-target candidate derived from an existing OpenClaw session. */
export type ForwardSessionCandidate = {
  /** Canonical outbound address, as used in the forwarded config (`origin.to`). */
  to: string;
  accountId: string;
  peerKind: ForwardPeerKind;
  /** Raw peer id from the session key (useful for display / dedup). */
  peerId?: string;
  /** Human label from session metadata, if any. */
  label?: string;
  /** Full session key, kept for display so users recognise it. */
  sessionKey: string;
  /** OpenClaw agent id owning this session (from the session key). */
  agentId?: string;
};

export type { ForwardPeerKind };

export function defaultForwardAccountId(target: SupportedForwardPlugin): string {
  return target.accountId ?? "";
}

export function getOpenclawStateDir(): string {
  return process.env.OPENCLAW_STATE_DIR || path.join(os.homedir(), ".openclaw");
}

function readJsonFile(filePath: string): unknown | undefined {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return undefined;
    console.warn(`[openclaw-looki] failed to parse ${filePath}: ${String(err)}`);
    return undefined;
  }
}

export function getWeixinAccountIds(): string[] {
  const filePath = path.join(getOpenclawStateDir(), "openclaw-weixin", "accounts.json");
  const parsed = readJsonFile(filePath);
  if (!Array.isArray(parsed)) return [];
  return parsed.map((entry) => String(entry).trim()).filter(Boolean);
}

export function hasPluginInstalled(
  cfg: OpenClawConfigShape,
  plugin: SupportedForwardPlugin,
): boolean {
  const installs = cfg.plugins?.installs ?? {};
  const entries = cfg.plugins?.entries ?? {};
  const allow = Array.isArray(cfg.plugins?.allow) ? cfg.plugins!.allow! : [];
  const channels = cfg.channels ?? {};

  const detectIds =
    Array.isArray(plugin.detectIds) && plugin.detectIds.length > 0 ? plugin.detectIds : [plugin.id];

  const detectedByPlugins = detectIds.some((id) =>
    Boolean(installs?.[id] || entries?.[id]?.enabled === true || allow.includes(id)),
  );
  if (detectedByPlugins) return true;
  if (channels[plugin.channel]) return true;
  if (plugin.channel === "openclaw-weixin" && getWeixinAccountIds().length > 0) return true;
  return false;
}

export function detectForwardTargets(cfg: OpenClawConfigShape): SupportedForwardPlugin[] {
  return SUPPORTED_FORWARD_PLUGINS.filter((plugin) => hasPluginInstalled(cfg, plugin));
}

function toNonEmptyString(value: unknown): string {
  return String(value ?? "").trim();
}

/**
 * Scan `sessions.json` for peers the bot has interacted with on the given
 * provider. Each session key already encodes channel + direct/group + peer id,
 * so we can derive the full forward target without asking the user.
 */
export function listForwardSessionsForChannel(channel: string): ForwardSessionCandidate[] {
  const sessionsFile = path.join(
    getOpenclawStateDir(),
    "agents",
    "main",
    "sessions",
    "sessions.json",
  );

  const parsed = readJsonFile(sessionsFile);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];

  const needle = `:${channel.toLowerCase()}:`;
  const entries: ForwardSessionCandidate[] = [];
  for (const [sessionKey, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!sessionKey.toLowerCase().includes(needle)) continue;
    const origin = (value as { origin?: unknown }).origin;
    if (!origin || typeof origin !== "object") continue;
    const record = origin as {
      provider?: unknown;
      to?: unknown;
      accountId?: unknown;
      label?: unknown;
    };
    if (toNonEmptyString(record.provider).toLowerCase() !== channel.toLowerCase()) continue;
    const to = toNonEmptyString(record.to);
    if (!to) continue;
    const sessionPeer = parseSessionKey(sessionKey);
    if (!sessionPeer) continue;
    const accountId = toNonEmptyString(record.accountId) || "default";
    const label = toNonEmptyString(record.label);
    entries.push({
      to,
      accountId,
      peerKind: sessionPeer.peerKind,
      peerId: sessionPeer.peerId,
      ...(label ? { label } : {}),
      sessionKey,
      ...(sessionPeer.agentId ? { agentId: sessionPeer.agentId } : {}),
    });
  }

  const seen = new Set<string>();
  return entries.filter((entry) => {
    const dedupe = `${entry.accountId.toLowerCase()} ${entry.to.toLowerCase()}`;
    if (seen.has(dedupe)) return false;
    seen.add(dedupe);
    return true;
  });
}

function readExistingForwardTargets(cfg: OpenClawConfigShape): ExistingForwardEntry[] {
  const channels = cfg.channels ?? {};
  const section = channels[CHANNEL_ID] as { forwardTo?: unknown } | undefined;
  return Array.isArray(section?.forwardTo)
    ? (section!.forwardTo as ExistingForwardEntry[])
    : [];
}

function matchExistingByChannel<T>(
  cfg: OpenClawConfigShape,
  availableTargets: readonly SupportedForwardPlugin[],
  selector: (matched: ExistingForwardEntry | null, target: SupportedForwardPlugin) => T,
): Record<string, T> {
  const currentTargets = readExistingForwardTargets(cfg);
  const usedIndexes = new Set<number>();

  return Object.fromEntries(
    availableTargets.map((target) => {
      const matchedIndex = currentTargets.findIndex(
        (entry, entryIndex) => !usedIndexes.has(entryIndex) && entry?.channel === target.channel,
      );
      const matched = matchedIndex >= 0 ? currentTargets[matchedIndex] : null;
      if (matchedIndex >= 0) usedIndexes.add(matchedIndex);
      return [target.id, selector(matched, target)];
    }),
  );
}

export type ForwardDrafts = {
  values: ForwardDraftMap;
  accountIds: ForwardDraftMap;
  sessionKeys: ForwardDraftMap;
  validIds: Set<string>;
};

export function buildInitialDrafts(
  cfg: OpenClawConfigShape,
  availableTargets: readonly SupportedForwardPlugin[],
): ForwardDrafts {
  const values = matchExistingByChannel(cfg, availableTargets, (m) => m?.to || "");
  const accountIds = matchExistingByChannel(
    cfg,
    availableTargets,
    (m, target) => m?.accountId || defaultForwardAccountId(target) || "",
  );
  const sessionKeys = matchExistingByChannel(cfg, availableTargets, (m) =>
    typeof m?.sessionKey === "string" ? m.sessionKey : "",
  );
  const validIds = new Set(
    availableTargets
      .filter((t) => values[t.id] && sessionKeys[t.id])
      .map((t) => t.id),
  );
  return { values, accountIds, sessionKeys, validIds };
}

export function buildForwardTargetsFromDrafts(
  availableTargets: readonly SupportedForwardPlugin[],
  drafts: ForwardDrafts,
): ForwardDraftTarget[] {
  const targets: ForwardDraftTarget[] = [];
  for (const target of availableTargets) {
    if (!drafts.validIds.has(target.id)) continue;
    const sessionKey = drafts.sessionKeys[target.id];
    if (!sessionKey) continue;
    const accountId = drafts.accountIds[target.id] || defaultForwardAccountId(target);
    targets.push({
      channel: target.channel,
      ...(accountId ? { accountId } : {}),
      to: drafts.values[target.id],
      sessionKey,
    });
  }
  return targets;
}
