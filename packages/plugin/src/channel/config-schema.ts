import { z } from "zod";

import {
  CHANNEL_ID,
  DEFAULT_ACCOUNT_ID,
  DEFAULT_BASE_URL,
  DEFAULT_MAX_EVENTS,
  DEFAULT_POLL_TIMEOUT_MS,
} from "../shared/index.js";

const LookiForwardTargetSchema = z
  .object({
    channel: z.string().min(1),
    accountId: z.string().min(1).optional(),
    to: z.string().min(1),
  })
  .strict();

export const lookiChannelConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    baseUrl: z.string().default(DEFAULT_BASE_URL).optional(),
    apiKey: z.string().optional(),
    accountId: z.string().default(DEFAULT_ACCOUNT_ID).optional(),
    pollTimeoutMs: z.number().min(1000).max(60000).default(DEFAULT_POLL_TIMEOUT_MS).optional(),
    maxEvents: z.number().min(1).max(100).default(DEFAULT_MAX_EVENTS).optional(),
    forwardTo: z.array(LookiForwardTargetSchema).optional(),
  })
  .strict();

export type LookiChannelConfigValidationIssue = {
  path: string;
  message: string;
};

/**
 * Best-effort validation. Returns structured issues without throwing, so the
 * plugin can log them at startup and still attempt to run with whatever was
 * parsed by the looser resolveLookiAccount.
 */
export function validateLookiChannelConfig(cfg: unknown): LookiChannelConfigValidationIssue[] {
  const channels = (cfg as { channels?: Record<string, unknown> } | undefined)?.channels ?? {};
  const section = channels[CHANNEL_ID];
  if (section == null) return [];

  const result = lookiChannelConfigSchema.safeParse(section);
  if (result.success) return [];

  return result.error.issues.map((issue) => ({
    path: [CHANNEL_ID, ...issue.path.map(String)].join("."),
    message: issue.message,
  }));
}
