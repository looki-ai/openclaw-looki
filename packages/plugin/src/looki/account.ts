import type { OpenClawConfig } from "openclaw/plugin-sdk/core";

import { normalizeForwardTargets, type LookiForwardTarget } from "../forwarding/types.js";
import {
  CHANNEL_ID,
  DEFAULT_ACCOUNT_ID,
  DEFAULT_BASE_URL,
  DEFAULT_MAX_EVENTS,
  DEFAULT_POLL_TIMEOUT_MS,
} from "../shared/index.js";
import { normalizeLookiBaseUrl } from "./base-url.js";

export type LookiAccountConfig = {
  enabled?: boolean;
  baseUrl?: string;
  apiKey?: string;
  accountId?: string;
  pollTimeoutMs?: number;
  maxEvents?: number;
  forwardTo?: LookiForwardTarget[] | LookiForwardTarget;
};

export type ResolvedLookiAccount = {
  accountId: string;
  enabled: boolean;
  configured: boolean;
  baseUrl: string;
  apiKey: string;
  pollTimeoutMs: number;
  maxEvents: number;
  forwardTo: LookiForwardTarget[];
};

export { DEFAULT_ACCOUNT_ID, DEFAULT_BASE_URL, DEFAULT_POLL_TIMEOUT_MS, DEFAULT_MAX_EVENTS };

function getLookiConfig(cfg: OpenClawConfig): LookiAccountConfig {
  const channels = (cfg as { channels?: Record<string, unknown> }).channels ?? {};
  return (channels[CHANNEL_ID] as LookiAccountConfig | undefined) ?? {};
}

export function resolveLookiAccount(
  cfg: OpenClawConfig,
  accountId?: string | null,
): ResolvedLookiAccount {
  const section = getLookiConfig(cfg);
  const id = accountId || section.accountId || DEFAULT_ACCOUNT_ID;
  const baseUrl = normalizeLookiBaseUrl((section.baseUrl ?? "").trim() || DEFAULT_BASE_URL);
  const apiKey = (section.apiKey ?? "").trim();
  return {
    accountId: id,
    enabled: section.enabled !== false,
    configured: Boolean(baseUrl && apiKey),
    baseUrl,
    apiKey,
    pollTimeoutMs: section.pollTimeoutMs ?? DEFAULT_POLL_TIMEOUT_MS,
    maxEvents: section.maxEvents ?? DEFAULT_MAX_EVENTS,
    forwardTo: normalizeForwardTargets(section.forwardTo),
  };
}

export function listLookiAccountIds(cfg: OpenClawConfig): string[] {
  const section = getLookiConfig(cfg);
  if (!section || Object.keys(section).length === 0) return [];
  return [section.accountId || DEFAULT_ACCOUNT_ID];
}
