import type { PluginRuntime } from "openclaw/plugin-sdk/core";

let pluginRuntime: PluginRuntime | null = null;

export type LookiChannelRuntime = PluginRuntime["channel"];
export type LookiChannelRuntimeInput = unknown;

export function setLookiRuntime(next: PluginRuntime): void {
  pluginRuntime = next;
}

const WAIT_INTERVAL_MS = 100;
const DEFAULT_TIMEOUT_MS = 10_000;

export async function waitForLookiRuntime(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<PluginRuntime> {
  const start = Date.now();
  while (!pluginRuntime) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("openclaw-looki runtime initialization timeout");
    }
    await new Promise((resolve) => setTimeout(resolve, WAIT_INTERVAL_MS));
  }
  return pluginRuntime;
}

/**
 * Prefer the gateway-injected `channelRuntime` on ctx when present; fall back
 * to the global set by the plugin register() hook.
 */
export async function resolveLookiChannelRuntime(params: {
  channelRuntime?: LookiChannelRuntimeInput;
  waitTimeoutMs?: number;
}): Promise<LookiChannelRuntime> {
  if (params.channelRuntime) return params.channelRuntime as LookiChannelRuntime;
  if (pluginRuntime) return pluginRuntime.channel;
  const pr = await waitForLookiRuntime(params.waitTimeoutMs ?? DEFAULT_TIMEOUT_MS);
  return pr.channel;
}
