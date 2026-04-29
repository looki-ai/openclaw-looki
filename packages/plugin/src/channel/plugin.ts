import { buildChannelConfigSchema, type ChannelPlugin } from "openclaw/plugin-sdk/core";
import {
  buildBaseChannelStatusSummary,
  createComputedAccountStatusAdapter,
  createDefaultChannelRuntimeState,
} from "openclaw/plugin-sdk/status-helpers";
import {
  DEFAULT_ACCOUNT_ID,
  DEFAULT_BASE_URL,
  listLookiAccountIds,
  resolveLookiAccount,
  type ResolvedLookiAccount,
} from "../looki/account.js";
import { monitorLookiProvider } from "./monitor.js";
import { lookiSetupWizard } from "./setup.js";

import { lookiChannelConfigSchema, validateLookiChannelConfig } from "./config-schema.js";

export const lookiPlugin: ChannelPlugin<ResolvedLookiAccount> = {
  id: "openclaw-looki",
  meta: {
    id: "openclaw-looki",
    label: "openclaw-looki",
    selectionLabel: "openclaw-looki (event channel)",
    docsPath: "/channels/openclaw-looki",
    docsLabel: "openclaw-looki",
    blurb: "Inbound-only event channel that long-polls Looki events.",
    order: 80,
  },
  setupWizard: lookiSetupWizard,
  capabilities: {
    chatTypes: ["direct"],
    media: false,
    blockStreaming: true,
  },
  configSchema: {
    ...buildChannelConfigSchema(lookiChannelConfigSchema),
  },
  reload: { configPrefixes: ["channels.openclaw-looki"] },
  config: {
    listAccountIds: listLookiAccountIds,
    resolveAccount: resolveLookiAccount,
    isConfigured: (account) => account.configured,
    describeAccount: (account) => ({
      accountId: account.accountId,
      enabled: account.enabled,
      configured: account.configured,
      baseUrl: account.baseUrl,
    }),
  },
  status: createComputedAccountStatusAdapter({
    defaultRuntime: createDefaultChannelRuntimeState(DEFAULT_ACCOUNT_ID, {
      lastEventAt: null,
      lastInboundAt: null,
      baseUrl: DEFAULT_BASE_URL,
    }),
    buildChannelSummary: ({ snapshot }) =>
      buildBaseChannelStatusSummary(snapshot, {
        lastEventAt: snapshot.lastEventAt ?? null,
        lastInboundAt: snapshot.lastInboundAt ?? null,
      }),
    resolveAccountSnapshot: ({ account }) => ({
      accountId: account.accountId,
      enabled: account.enabled,
      configured: account.configured,
      baseUrl: account.baseUrl,
    }),
    resolveAccountState: ({ configured, enabled }) => {
      if (!enabled) return "disabled";
      return configured ? "configured" : "not configured";
    },
  }),
  // Inbound-only channel: outbound delivery is intentionally disabled.
  outbound: {
    deliveryMode: "direct",
    sendText: async () => {
      throw new Error(
        "openclaw-looki is an inbound-only event channel; outbound delivery is not supported",
      );
    },
  },
  gateway: {
    startAccount: async (ctx) => {
      const account = ctx.account;
      if (!account.enabled) {
        ctx.log?.info?.(`[openclaw-looki] account ${account.accountId} disabled, skipping`);
        return;
      }
      const issues = validateLookiChannelConfig(ctx.cfg);
      if (issues.length > 0) {
        for (const issue of issues) {
          ctx.log?.error?.(`[openclaw-looki] config error: ${issue.path}: ${issue.message}`);
        }
        throw new Error(
          `openclaw-looki config invalid: ${issues
            .map((i) => `${i.path}: ${i.message}`)
            .join("; ")}`,
        );
      }
      if (!account.configured) {
        ctx.log?.error?.(
          `[openclaw-looki] account ${account.accountId} not configured (need baseUrl, apiKey)`,
        );
        throw new Error("openclaw-looki not configured: need baseUrl, apiKey");
      }

      ctx.setStatus?.({
        accountId: account.accountId,
        running: true,
        lastStartAt: Date.now(),
      });

      return monitorLookiProvider({
        baseUrl: account.baseUrl,
        apiKey: account.apiKey,
        accountId: account.accountId,
        config: ctx.cfg,
        channelRuntime: ctx.channelRuntime,
        runtime: { log: ctx.log?.info, error: ctx.log?.error },
        abortSignal: ctx.abortSignal,
        pollTimeoutMs: account.pollTimeoutMs,
        maxEvents: account.maxEvents,
        setStatus: ctx.setStatus,
        forwardTo: account.forwardTo,
      });
    },
  },
};
