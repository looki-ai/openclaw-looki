import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import {
  buildOutboundSessionContext,
  deliverOutboundPayloads,
  type DeliverOutboundPayloadsParams,
} from "openclaw/plugin-sdk/outbound-runtime";

import { parseSessionKeyDetailed, type LookiForwardTarget } from "../shared/index.js";

type OutboundChannel = DeliverOutboundPayloadsParams["channel"];

export type ForwardDeps = {
  cfg: OpenClawConfig;
  forwardTo: LookiForwardTarget[];
  idempotencyKey?: string;
  log: (msg: string) => void;
  errLog: (msg: string) => void;
};

export type ForwardResult = {
  ok: number;
  failed: number;
};

/**
 * Forward a piece of agent output to configured downstream channels in parallel.
 * Each target is isolated: one failure or slow target does not block the others.
 */
export async function forwardAgentOutput(text: string, deps: ForwardDeps): Promise<ForwardResult> {
  if (!text.trim()) return { ok: 0, failed: 0 };
  const results = await Promise.all(
    deps.forwardTo.map(async (target) => {
      const label = `${target.channel}:${target.accountId ?? "default"}:${target.to}`;
      try {
        const parsed = parseSessionKeyDetailed(target.sessionKey);
        if (!parsed.ok) {
          throw new Error(`invalid sessionKey (${parsed.error}): ${target.sessionKey}`);
        }
        await deliverOutboundPayloads({
          cfg: deps.cfg,
          channel: target.channel as OutboundChannel,
          to: target.to,
          accountId: target.accountId,
          payloads: [{ text }],
          session: buildOutboundSessionContext({
            cfg: deps.cfg,
            agentId: parsed.value.agentId,
            sessionKey: target.sessionKey,
            conversationType: parsed.value.peerKind,
          }),
          mirror: {
            sessionKey: target.sessionKey,
            agentId: parsed.value.agentId,
            text,
            isGroup: parsed.value.peerKind === "group",
            // Scope the idempotency key by target so the same upstream event
            // can still fan out to every configured downstream once.
            idempotencyKey: deps.idempotencyKey
              ? `openclaw-looki:forward:${label}:${deps.idempotencyKey}`
              : undefined,
          },
        });
        deps.log(`[openclaw-looki] forwarded to ${label} len=${text.length}`);
        return true;
      } catch (err) {
        deps.errLog(`[openclaw-looki] forward to ${label} failed: ${String(err)}`);
        return false;
      }
    }),
  );
  return {
    ok: results.filter(Boolean).length,
    failed: results.filter((ok) => !ok).length,
  };
}
