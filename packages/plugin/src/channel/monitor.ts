import type { ChannelAccountSnapshot } from "openclaw/plugin-sdk/channel-contract";
import { createTypingCallbacks } from "openclaw/plugin-sdk/channel-runtime";
import type { OpenClawConfig } from "openclaw/plugin-sdk/core";

import { getUpdates, type LookiEventEnvelope } from "../looki/client.js";
import { forwardAgentOutput } from "../forwarding/forward.js";
import { lookiEventToMessageContext, resolveAgentText } from "../looki/events.js";
import { sanitizeLogMessage, type LookiForwardTarget } from "../shared/index.js";
import {
  resolveLookiChannelRuntime,
  type LookiChannelRuntime,
  type LookiChannelRuntimeInput,
} from "./runtime.js";

const DEFAULT_POLL_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_EVENTS = 10;
const RETRY_DELAY_MS = 2_000;
const MAX_CONSECUTIVE_FAILURES = 3;
const MAX_CONSECUTIVE_FORWARD_FAILURES = 5;
const BACKOFF_DELAY_MS = 30_000;
// On 409 (poll_in_flight) the server already has another poller; back off a
// bit longer than the usual retry to let the other poller unwind.
const CONFLICT_BACKOFF_MS = 5_000;

export type MonitorLookiOpts = {
  baseUrl: string;
  apiKey: string;
  accountId: string;
  config: OpenClawConfig;
  channelRuntime?: LookiChannelRuntimeInput;
  runtime?: { log?: (msg: string) => void; error?: (msg: string) => void };
  abortSignal?: AbortSignal;
  pollTimeoutMs?: number;
  maxEvents?: number;
  setStatus?: (next: ChannelAccountSnapshot) => void;
  forwardTo?: LookiForwardTarget[];
};

export async function monitorLookiProvider(opts: MonitorLookiOpts): Promise<void> {
  const {
    baseUrl,
    apiKey,
    accountId,
    config,
    abortSignal,
    pollTimeoutMs,
    maxEvents,
    setStatus,
    forwardTo,
  } = opts;
  const rawLog = opts.runtime?.log ?? (() => {});
  const rawErrLog = opts.runtime?.error ?? ((m: string) => rawLog(m));
  const log = (msg: string) => rawLog(sanitizeLogMessage(msg));
  const errLog = (msg: string) => rawErrLog(sanitizeLogMessage(msg));

  const updateStatus = (patch: Omit<ChannelAccountSnapshot, "accountId">) =>
    setStatus?.({ ...patch, accountId, running: true });

  const channelRuntime = await resolveLookiChannelRuntime({
    channelRuntime: opts.channelRuntime,
  });

  const timeoutMs = pollTimeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;
  const eventsPerPoll = maxEvents ?? DEFAULT_MAX_EVENTS;
  log(`[openclaw-looki] monitor started (${baseUrl}, account=${accountId})`);

  let consecutiveFailures = 0;
  let consecutiveForwardFailures = 0;

  const recordForwardResult = (eventId: string, ok: number, failed: number) => {
    // Total failure = all targets failed. A mixed ok/failed result means the
    // system is still partially working (e.g. one downstream is down but the
    // others delivered) — don't escalate to a "something is broken" alert on
    // that. Purely-empty outcomes (0/0, no text or no targets) leave the
    // counter untouched since no delivery was attempted.
    if (failed === 0 && ok > 0) {
      consecutiveForwardFailures = 0;
      return;
    }
    if (ok > 0) return;
    if (failed === 0) return;
    consecutiveForwardFailures += 1;
    if (consecutiveForwardFailures >= MAX_CONSECUTIVE_FORWARD_FAILURES) {
      errLog(
        `[openclaw-looki] forwarding fully failed for ${consecutiveForwardFailures} consecutive events; latest event=${eventId} failed=${failed}`,
      );
      consecutiveForwardFailures = 0;
    }
  };

  while (!abortSignal?.aborted) {
    try {
      const resp = await getUpdates({
        baseUrl,
        apiKey,
        timeoutMs,
        maxEvents: eventsPerPoll,
        heartbeatAtMs: Date.now(),
      });

      if (resp.ret !== 0) {
        consecutiveFailures += 1;
        // Silent for transient non-zero ret; only log once when we escalate to long backoff.
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          errLog(
            `[openclaw-looki] getUpdates ret=${resp.ret} for ${MAX_CONSECUTIVE_FAILURES} polls — backing off ${BACKOFF_DELAY_MS}ms`,
          );
          consecutiveFailures = 0;
          await sleep(BACKOFF_DELAY_MS, abortSignal);
        } else {
          await sleep(RETRY_DELAY_MS, abortSignal);
        }
        continue;
      }

      consecutiveFailures = 0;
      updateStatus({ lastEventAt: Date.now() });
      for (const event of resp.events ?? []) {
        try {
          await processLookiEvent(event, {
            accountId,
            config,
            channelRuntime,
            forwardTo,
            log,
            errLog,
            recordForwardResult,
          });
          updateStatus({ lastInboundAt: Date.now() });
        } catch (err) {
          errLog(
            `[openclaw-looki] processLookiEvent failed event_id=${event.id} err=${String(err)}`,
          );
        }
      }
    } catch (err) {
      if (abortSignal?.aborted) return;
      const status = (err as Error & { status?: number })?.status;
      if (status === 409) {
        // Another poller on this subscription is active; benign, just back off.
        await sleep(CONFLICT_BACKOFF_MS, abortSignal);
        continue;
      }
      consecutiveFailures += 1;
      // Silent for transient errors; only log once when we escalate to long backoff.
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        errLog(
          `[openclaw-looki] getUpdates failing for ${MAX_CONSECUTIVE_FAILURES} polls — backing off ${BACKOFF_DELAY_MS}ms. last error: ${String(err)}`,
        );
        consecutiveFailures = 0;
        await sleep(BACKOFF_DELAY_MS, abortSignal);
      } else {
        await sleep(RETRY_DELAY_MS, abortSignal);
      }
    }
  }
  log(`[openclaw-looki] monitor ended`);
}

type ProcessDeps = {
  accountId: string;
  config: OpenClawConfig;
  channelRuntime: LookiChannelRuntime;
  forwardTo?: LookiForwardTarget[];
  log: (msg: string) => void;
  errLog: (msg: string) => void;
  recordForwardResult: (eventId: string, ok: number, failed: number) => void;
};

async function processLookiEvent(event: LookiEventEnvelope, deps: ProcessDeps): Promise<void> {
  // ai_revise is a dispatch hint from the server. Default true for back-compat
  // when the server omits it (older deployments).
  const aiRevise = event.ai_revise !== false;
  if (!aiRevise) {
    // Bypass the agent: forward event text verbatim to the downstream channel.
    const text = resolveAgentText(event);
    deps.log(
      `[openclaw-looki] ai_revise=false, forwarding verbatim event=${event.id} len=${text.length}`,
    );
    if (!text) return;
    if ((deps.forwardTo?.length ?? 0) === 0) {
      deps.log(`[openclaw-looki] event=${event.id} dropped: no forwardTo configured`);
      return;
    }
    const result = await forwardAgentOutput(text, {
      cfg: deps.config,
      forwardTo: deps.forwardTo ?? [],
      idempotencyKey: event.id,
      log: deps.log,
      errLog: deps.errLog,
    });
    deps.recordForwardResult(event.id, result.ok, result.failed);
    return;
  }

  const ctx = lookiEventToMessageContext(event, deps.accountId);
  deps.log(
    `[openclaw-looki] ai_revise=true, dispatching event=${event.id} to=${ctx.To} forwardTargets=${deps.forwardTo?.length ?? 0}`,
  );

  const route = deps.channelRuntime.routing.resolveAgentRoute({
    cfg: deps.config,
    channel: "openclaw-looki",
    accountId: deps.accountId,
    peer: { kind: "direct", id: ctx.To },
  });
  ctx.SessionKey = route.sessionKey;
  deps.log(
    `[openclaw-looki] resolved route event=${event.id} agent=${route.agentId ?? "<none>"} sessionKey=${route.sessionKey ?? "<none>"}`,
  );

  const storePath = deps.channelRuntime.session.resolveStorePath(deps.config.session?.store, {
    agentId: route.agentId,
  });

  const finalized = deps.channelRuntime.reply.finalizeInboundContext(
    ctx as Parameters<typeof deps.channelRuntime.reply.finalizeInboundContext>[0],
  );

  await deps.channelRuntime.session.recordInboundSession({
    storePath,
    sessionKey: route.sessionKey,
    ctx: finalized as Parameters<typeof deps.channelRuntime.session.recordInboundSession>[0]["ctx"],
    updateLastRoute: {
      sessionKey: route.mainSessionKey,
      channel: "openclaw-looki",
      to: ctx.To,
      accountId: deps.accountId,
    },
    onRecordError: (err) => deps.errLog(`[openclaw-looki] recordInboundSession: ${String(err)}`),
  });

  const { dispatcher, replyOptions, markDispatchIdle } =
    deps.channelRuntime.reply.createReplyDispatcherWithTyping({
      humanDelay: deps.channelRuntime.reply.resolveHumanDelayConfig(deps.config, route.agentId),
      typingCallbacks: createTypingCallbacks({
        start: async () => {},
        stop: async () => {},
        onStartError: () => {},
        onStopError: () => {},
      }),
      deliver: async (payload, info) => {
        const kind = info?.kind ?? "unknown";
        const text = payload.text ?? "";
        deps.log(`[openclaw-looki] deliver kind=${kind} event=${event.id} len=${text.length}`);
        // Only forward the agent's final per-turn reply. "block" fragments are
        // streaming chunks / tool-call narration and would spam downstream chats.
        if (kind !== "final") {
          return;
        }
        if (!text) {
          deps.log(
            `[openclaw-looki] deliver skipped (empty text) event=${event.id} kind=${kind}`,
          );
          return;
        }
        if ((deps.forwardTo?.length ?? 0) === 0) {
          deps.log(`[openclaw-looki] deliver has no forwardTo targets, dropping event=${event.id}`);
          return;
        }
        const result = await forwardAgentOutput(text, {
          cfg: deps.config,
          forwardTo: deps.forwardTo ?? [],
          idempotencyKey: event.id,
          log: deps.log,
          errLog: deps.errLog,
        });
        deps.recordForwardResult(event.id, result.ok, result.failed);
      },
      onError: (err, info) => {
        deps.errLog(`[openclaw-looki] reply ${info.kind}: ${String(err)}`);
      },
    });

  try {
    const result = await deps.channelRuntime.reply.withReplyDispatcher({
      dispatcher,
      run: () =>
        deps.channelRuntime.reply.dispatchReplyFromConfig({
          ctx: finalized,
          cfg: deps.config,
          dispatcher,
          replyOptions: { ...replyOptions, disableBlockStreaming: true },
        }),
    });
    const counts = (result as { counts?: { tool?: number; block?: number; final?: number } })
      ?.counts;
    deps.log(
      `[openclaw-looki] dispatch done event=${event.id} tool=${counts?.tool ?? 0} block=${counts?.block ?? 0} final=${counts?.final ?? 0}`,
    );
  } finally {
    markDispatchIdle();
  }
}

// Abort-aware sleep. Resolves on timeout OR on abort — the outer loop's
// `while (!abortSignal?.aborted)` is the single source of truth for shutdown,
// so abort-as-rejection would just force every caller to re-catch "aborted"
// as not-really-an-error.
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      resolve();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
