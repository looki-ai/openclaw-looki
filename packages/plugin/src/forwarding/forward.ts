import type { OpenClawConfig } from "openclaw/plugin-sdk/core";

import type { LookiForwardTarget } from "./types.js";

export type ForwardOutboundAdapter = {
  sendText?: (ctx: {
    cfg: OpenClawConfig;
    to: string;
    text: string;
    accountId?: string | null;
  }) => Promise<{ channel?: string; messageId?: string; meta?: unknown } | void>;
};

/**
 * The subset of OpenClaw's channel runtime this plugin consumes. Only
 * `outbound.loadAdapter` is required today; everything else is ignored.
 */
export type ForwardChannelRuntime = {
  outbound?: {
    loadAdapter?: (channel: string) => Promise<ForwardOutboundAdapter | undefined>;
  };
};

const INSTALL_HINTS: Record<string, string> = {
  feishu: "install @larksuite/openclaw-lark",
  "openclaw-weixin": "install @tencent-weixin/openclaw-weixin",
  qqbot: "install @openclaw/qqbot",
  whatsapp: "install @openclaw/whatsapp",
  telegram: "install @openclaw/telegram",
  discord: "install @openclaw/discord",
};

export type ForwardDeps = {
  cfg: OpenClawConfig;
  forwardTo: LookiForwardTarget[];
  channelRuntime?: ForwardChannelRuntime;
  log: (msg: string) => void;
  errLog: (msg: string) => void;
};

function formatTarget(target: LookiForwardTarget): string {
  return `${target.channel}:${target.accountId ?? "default"}:${target.to}`;
}

async function sendToTarget(
  target: LookiForwardTarget,
  text: string,
  cfg: OpenClawConfig,
  runtime: ForwardChannelRuntime | undefined,
): Promise<void> {
  const loadAdapter = runtime?.outbound?.loadAdapter;
  if (!loadAdapter) {
    throw new Error(
      "OpenClaw runtime does not expose channel.outbound.loadAdapter; upgrade OpenClaw to >=2026.4.24 and restart the gateway",
    );
  }
  const adapter = await loadAdapter(target.channel);
  if (!adapter?.sendText) {
    const hint = INSTALL_HINTS[target.channel];
    const suffix = hint ? `; ${hint}` : "";
    throw new Error(
      `${target.channel} outbound adapter is unavailable${suffix}; ensure the channel plugin is installed, enabled, configured, and the gateway was restarted`,
    );
  }
  await adapter.sendText({
    cfg,
    to: target.to,
    text,
    accountId: target.accountId,
  });
}

/**
 * Forward a piece of agent output to configured downstream channels in parallel.
 * Each target is isolated: one failure or slow target does not block the others.
 */
export async function forwardAgentOutput(text: string, deps: ForwardDeps): Promise<void> {
  if (!text.trim()) return;
  await Promise.all(
    deps.forwardTo.map(async (target) => {
      try {
        await sendToTarget(target, text, deps.cfg, deps.channelRuntime);
        deps.log(`[openclaw-looki] forwarded to ${formatTarget(target)} len=${text.length}`);
      } catch (err) {
        deps.errLog(`[openclaw-looki] forward to ${formatTarget(target)} failed: ${String(err)}`);
      }
    }),
  );
}
