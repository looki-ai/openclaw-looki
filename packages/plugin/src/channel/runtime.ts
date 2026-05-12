import type { PluginRuntime } from "openclaw/plugin-sdk/core";

type RuntimeWaiter = {
  resolve: (runtime: PluginRuntime) => void;
  reject: (err: Error) => void;
};

let pluginRuntime: PluginRuntime | null = null;
const runtimeWaiters = new Set<RuntimeWaiter>();

export type LookiChannelRuntime = PluginRuntime["channel"];
export type LookiChannelRuntimeInput = unknown;

/**
 * Install (or tear down) the plugin runtime injected by the host.
 *   - `next` non-null wakes up pending waiters with the runtime.
 *   - `next` null clears the runtime and rejects pending waiters so they exit
 *     their `await resolveLookiChannelRuntime` immediately instead of waiting
 *     for the 10s timeout (which would delay host-initiated shutdown).
 */
export function setLookiRuntime(next: PluginRuntime | null): void {
  pluginRuntime = next;
  if (runtimeWaiters.size === 0) return;
  const pending = [...runtimeWaiters];
  runtimeWaiters.clear();
  if (next) {
    for (const w of pending) w.resolve(next);
  } else {
    const err = new Error("openclaw-looki runtime torn down before it was ready");
    for (const w of pending) w.reject(err);
  }
}

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Prefer the gateway-injected `channelRuntime` on ctx when present; fall back
 * to the runtime set by the plugin register() hook. register() and
 * startAccount() can race during gateway startup, so callers wait on a shared
 * promise instead of each account spinning its own polling loop.
 */
export async function resolveLookiChannelRuntime(params: {
  channelRuntime?: LookiChannelRuntimeInput;
  waitTimeoutMs?: number;
}): Promise<LookiChannelRuntime> {
  if (params.channelRuntime) return params.channelRuntime as LookiChannelRuntime;

  if (pluginRuntime) return pluginRuntime.channel;

  const timeoutMs = params.waitTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const runtime = await new Promise<PluginRuntime>((resolve, reject) => {
    const waiter: RuntimeWaiter = {
      resolve: (next) => {
        clearTimeout(timeout);
        runtimeWaiters.delete(waiter);
        resolve(next);
      },
      reject: (err) => {
        clearTimeout(timeout);
        runtimeWaiters.delete(waiter);
        reject(err);
      },
    };
    const timeout = setTimeout(() => {
      runtimeWaiters.delete(waiter);
      reject(new Error("openclaw-looki runtime initialization timeout"));
    }, timeoutMs);
    runtimeWaiters.add(waiter);
  });
  return runtime.channel;
}
