import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import {
  buildOutboundSessionContext,
  deliverOutboundPayloads,
  type DeliverOutboundPayloadsParams,
} from "openclaw/plugin-sdk/outbound-runtime";

import type { LookiForwardPeerKind, LookiForwardTarget } from "./types.js";

type OutboundChannel = DeliverOutboundPayloadsParams["channel"];

/**
 * The subset of OpenClaw's channel runtime this plugin consumes. Requires the
 * routing helper shipped in openclaw >= 2026.4.24 so that forwarded agent
 * replies are mirrored into the target session's transcript.
 */
export type ForwardChannelRuntime = {
  routing: {
    resolveAgentRoute: (params: {
      cfg: OpenClawConfig;
      channel: string;
      accountId?: string | null;
      peer: { kind: LookiForwardPeerKind; id: string };
    }) => {
      agentId?: string;
      sessionKey?: string;
      mainSessionKey?: string;
    };
  };
};

export type ForwardDeps = {
  cfg: OpenClawConfig;
  forwardTo: LookiForwardTarget[];
  channelRuntime: ForwardChannelRuntime;
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
  runtime: ForwardChannelRuntime,
  idempotencyKey: string | undefined,
): Promise<void> {
  const peerKind: LookiForwardPeerKind = target.peerKind ?? "direct";

  const route = runtime.routing.resolveAgentRoute({
    cfg,
    channel: target.channel,
    accountId: target.accountId,
    peer: { kind: peerKind, id: target.to },
  });
  const sessionKey = route?.sessionKey;
  if (!sessionKey) {
    throw new Error(
      `resolveAgentRoute returned no sessionKey for ${formatTarget(target)} kind=${peerKind}`,
    );
  }

  await deliverOutboundPayloads({
    cfg,
    channel: target.channel as OutboundChannel,
    to: target.to,
    accountId: target.accountId,
    payloads: [{ text }],
    session: buildOutboundSessionContext({
      cfg,
      agentId: route.agentId,
      sessionKey,
      conversationType: peerKind,
    }),
    mirror: {
      sessionKey,
      agentId: route.agentId,
      text,
      isGroup: peerKind === "group",
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
        await sendToTarget(target, text, deps.cfg, deps.channelRuntime, deps.idempotencyKey);
        deps.log(`[openclaw-looki] forwarded to ${formatTarget(target)} len=${text.length}`);
      } catch (err) {
        deps.errLog(`[openclaw-looki] forward to ${formatTarget(target)} failed: ${String(err)}`);
      }
    }),
  );
}
