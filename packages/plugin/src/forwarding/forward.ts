import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import {
  buildOutboundSessionContext,
  deliverOutboundPayloads,
  type DeliverOutboundPayloadsParams,
} from "openclaw/plugin-sdk/outbound-runtime";

import type { LookiForwardTarget } from "./types.js";

type OutboundChannel = DeliverOutboundPayloadsParams["channel"];

export type ForwardDeps = {
  cfg: OpenClawConfig;
  forwardTo: LookiForwardTarget[];
  idempotencyKey?: string;
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
  idempotencyKey: string | undefined,
): Promise<void> {
  await deliverOutboundPayloads({
    cfg,
    channel: target.channel as OutboundChannel,
    to: target.to,
    accountId: target.accountId,
    payloads: [{ text }],
    session: buildOutboundSessionContext({
      cfg,
      agentId: target.agentId,
      sessionKey: target.sessionKey,
      conversationType: target.peerKind,
    }),
    mirror: {
      sessionKey: target.sessionKey,
      agentId: target.agentId,
      text,
      isGroup: target.peerKind === "group",
      idempotencyKey: idempotencyKey
        ? `openclaw-looki:forward:${target.channel}:${target.accountId ?? "default"}:${
            target.to
          }:${idempotencyKey}`
        : undefined,
    },
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
        await sendToTarget(target, text, deps.cfg, deps.idempotencyKey);
        deps.log(`[openclaw-looki] forwarded to ${formatTarget(target)} len=${text.length}`);
      } catch (err) {
        deps.errLog(`[openclaw-looki] forward to ${formatTarget(target)} failed: ${String(err)}`);
      }
    }),
  );
}
