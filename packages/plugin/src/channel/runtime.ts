import type { PluginRuntime } from "openclaw/plugin-sdk/core";

let pluginRuntime: PluginRuntime | null = null;

export type LookiChannelRuntime = PluginRuntime["channel"];
export type LookiChannelRuntimeInput = unknown;

export function setLookiRuntime(next: PluginRuntime): void {
  pluginRuntime = next;
}

const WAIT_INTERVAL_MS = 100;
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Prefer the gateway-injected `channelRuntime` on ctx when present; fall back
 * to the global set by the plugin register() hook. Polls because register()
 * and startAccount() can race during gateway startup.
 */
export async function resolveLookiChannelRuntime(params: {
  channelRuntime?: LookiChannelRuntimeInput;
  waitTimeoutMs?: number;
}): Promise<LookiChannelRuntime> {
  if (params.channelRuntime) return params.channelRuntime as LookiChannelRuntime;

  const timeoutMs = params.waitTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;
  while (pluginRuntime === null) {
    if (Date.now() > deadline) {
      throw new Error("openclaw-looki runtime initialization timeout");
    }
    await new Promise((resolve) => setTimeout(resolve, WAIT_INTERVAL_MS));
  }
  return (pluginRuntime as PluginRuntime).channel;
}
