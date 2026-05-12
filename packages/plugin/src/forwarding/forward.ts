import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import {
  buildOutboundSessionContext,
  deliverOutboundPayloads,
  type DeliverOutboundPayloadsParams,
} from "openclaw/plugin-sdk/outbound-runtime";

import { parseSessionKey } from "../shared/session-key.js";
import type { LookiForwardTarget } from "./types.js";

type OutboundChannel = DeliverOutboundPayloadsParams["channel"];

export type ForwardDeps = {
  cfg: OpenClawConfig;
  forwardTo: LookiForwardTarget[];
  idempotencyKey?: string;
  log: (msg: string) => void;
  errLog: (msg: string) => void;
};

/**
 * Forward a piece of agent output to configured downstream channels in parallel.
 * Each target is isolated: one failure or slow target does not block the others.
 */
export async function forwardAgentOutput(text: string, deps: ForwardDeps): Promise<void> {
  if (!text.trim()) return;
  await Promise.all(
    deps.forwardTo.map(async (target) => {
      const label = `${target.channel}:${target.accountId ?? "default"}:${target.to}`;
      try {
        if (!target.sessionKey) {
          throw new Error(
            "forward target is missing sessionKey; re-run `openclaw-looki configure` to pick a session",
          );
        }
        const parsed = parseSessionKey(target.sessionKey);
        if (!parsed) {
          throw new Error(`invalid sessionKey: ${target.sessionKey}`);
        }
        await deliverOutboundPayloads({
          cfg: deps.cfg,
          channel: target.channel as OutboundChannel,
          to: target.to,
          accountId: target.accountId,
          payloads: [{ text }],
          session: buildOutboundSessionContext({
            cfg: deps.cfg,
            agentId: parsed.agentId,
            sessionKey: target.sessionKey,
            conversationType: parsed.peerKind,
          }),
          mirror: {
            sessionKey: target.sessionKey,
            agentId: parsed.agentId,
            text,
            isGroup: parsed.peerKind === "group",
            // Scope the idempotency key by target so the same upstream event
            // can still fan out to every configured downstream once.
            idempotencyKey: deps.idempotencyKey
              ? `openclaw-looki:forward:${label}:${deps.idempotencyKey}`
              : undefined,
          },
        });
        deps.log(`[openclaw-looki] forwarded to ${label} len=${text.length}`);
      } catch (err) {
        deps.errLog(`[openclaw-looki] forward to ${label} failed: ${String(err)}`);
      }
    }),
  );
}
