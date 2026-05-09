import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { OpenClawConfigShape } from "./config.js";
import { type SupportedForwardPlugin, SUPPORTED_FORWARD_PLUGINS } from "./forward-plugins.js";

export function getOpenclawStateDir(): string {
  return process.env.OPENCLAW_STATE_DIR || path.join(os.homedir(), ".openclaw");
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function readJsonFile(filePath: string): unknown | undefined {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (err) {
    if (isMissingFile(err)) return undefined;
    console.warn(`[openclaw-looki] failed to parse ${filePath}: ${String(err)}`);
    return undefined;
  }
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

export function getWeixinAccountIds(): string[] {
  const filePath = path.join(getOpenclawStateDir(), "openclaw-weixin", "accounts.json");
  const parsed = readJsonFile(filePath);
  if (!Array.isArray(parsed)) return [];
  return parsed.map((entry) => String(entry).trim()).filter(Boolean);
}

export type ForwardPeerKind = "direct" | "group";

function toNonEmptyString(value: unknown): string {
  return String(value ?? "").trim();
}

/** Forward-target candidate derived from an existing openclaw session. */
export type ForwardSessionCandidate = {
  /** Canonical outbound address, as used in the forwarded config (`origin.to`). */
  to: string;
  accountId: string;
  peerKind: ForwardPeerKind;
  /** Raw peer id from the session key (useful for display / dedup). */
  peerId?: string;
  /** Human label from session metadata, if any. */
  label?: string;
  /** Full session key — kept for display so users recognise it. */
  sessionKey: string;
};

/**
 * Parse openclaw session keys of shape `agent:<agentId>:<channel>:<kind>:<peerId...>`.
 * `<peerId>` may itself contain `:` segments (e.g. `looki:account:default`),
 * which is why we rejoin everything from index 4 onward.
 */
function parseSessionKeyPeer(
  sessionKey: string,
): { peerKind: ForwardPeerKind; peerId: string } | undefined {
  const parts = sessionKey.split(":");
  const rawKind = parts[3]?.toLowerCase();
  const peerId = parts.slice(4).join(":");
  if (!peerId) return undefined;
  if (rawKind === "direct") return { peerKind: "direct", peerId };
  if (rawKind === "group" || rawKind === "channel") return { peerKind: "group", peerId };
  return undefined;
}

/**
 * Scan `sessions.json` for peers the bot has interacted with on the given
 * provider. Each session key already encodes channel + direct/group + peer id,
 * so we can derive the full forward target without asking
 * the user. Duplicate entries (same accountId + to) are collapsed.
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
    const sessionPeer = parseSessionKeyPeer(sessionKey);
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
