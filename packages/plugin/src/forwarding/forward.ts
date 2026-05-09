import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import {
  buildOutboundSessionContext,
  deliverOutboundPayloads,
  type DeliverOutboundPayloadsParams,
} from "openclaw/plugin-sdk/outbound-runtime";

import type { LookiForwardPeerKind, LookiForwardTarget } from "./types.js";

type OutboundChannel = DeliverOutboundPayloadsParams["channel"];

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

function parseSessionKey(sessionKey: string): { agentId?: string; peerKind?: LookiForwardPeerKind } {
  const parts = sessionKey.split(":");
  const agentId = parts[1] || undefined;
  const rawKind = parts[3]?.toLowerCase();
  const peerKind =
    rawKind === "group" || rawKind === "channel"
      ? "group"
      : rawKind === "direct"
        ? "direct"
        : undefined;
  return { agentId, peerKind };
}

async function sendToTarget(
  target: LookiForwardTarget,
  text: string,
  cfg: OpenClawConfig,
  runtime: ForwardChannelRuntime,
  idempotencyKey: string | undefined,
): Promise<void> {
  const parsedSession = parseSessionKey(target.sessionKey);
  const peerKind = parsedSession.peerKind;
  if (!peerKind) {
    throw new Error(`invalid sessionKey for ${formatTarget(target)}: cannot derive direct/group`);
  }

  const route = runtime.routing.resolveAgentRoute({
    cfg,
    channel: target.channel,
    accountId: target.accountId,
    peer: { kind: peerKind, id: target.to },
  });
  const sessionKey = target.sessionKey;

  await deliverOutboundPayloads({
    cfg,
    channel: target.channel as OutboundChannel,
    to: target.to,
    accountId: target.accountId,
    payloads: [{ text }],
    session: buildOutboundSessionContext({
      cfg,
      agentId: route.agentId ?? parsedSession.agentId,
      sessionKey,
      conversationType: peerKind,
    }),
    mirror: {
      sessionKey,
      agentId: route.agentId ?? parsedSession.agentId,
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
