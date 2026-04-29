import { CHANNEL_ID } from "./constants.js";

export type LookiChannelConfig = {
  enabled?: boolean;
  baseUrl?: string;
  apiKey?: string;
  accountId?: string;
  pollTimeoutMs?: number;
  maxEvents?: number;
  forwardTo?: Array<{ channel: string; accountId?: string; to: string }>;
};

export type OpenClawConfigShape = {
  channels?: Record<string, unknown>;
  plugins?: {
    installs?: Record<string, unknown>;
    entries?: Record<string, { enabled?: boolean }>;
    allow?: string[];
  };
  [key: string]: unknown;
};

export function patchLookiChannelConfig<T extends OpenClawConfigShape>(
  cfg: T,
  patch: Partial<LookiChannelConfig>,
): T {
  const channels = cfg.channels ?? {};
  const current = (channels[CHANNEL_ID] as Record<string, unknown> | undefined) ?? {};
  return {
    ...cfg,
    channels: {
      ...channels,
      [CHANNEL_ID]: {
        ...current,
        ...patch,
      },
    },
  };
}

export function getLookiChannelConfig(cfg: OpenClawConfigShape): LookiChannelConfig {
  const channels = cfg.channels ?? {};
  return (channels[CHANNEL_ID] as LookiChannelConfig | undefined) ?? {};
}
