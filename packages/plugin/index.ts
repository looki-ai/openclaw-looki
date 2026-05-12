import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";

import { lookiPlugin } from "./src/channel/plugin.js";
import { setLookiRuntime } from "./src/channel/runtime.js";
import { LOOKI_MEMORY_TOOL } from "./src/tools/memory-tool.js";
import { LOOKI_TASK_TOOL } from "./src/tools/task-tool.js";

export default {
  id: "openclaw-looki",
  name: "Looki",
  description: "Looki inbound event channel (long-poll, inbound-only)",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    if (api.runtime) {
      setLookiRuntime(api.runtime);
    }
    for (const tool of [LOOKI_MEMORY_TOOL, LOOKI_TASK_TOOL]) {
      try {
        api.registerTool({
          name: tool.name,
          label: tool.label,
          description: tool.description,
          parameters: tool.parameters,
          execute: tool.makeExecute(() => api.config, api.logger),
        });
      } catch (err) {
        api.logger?.error?.(
          `[openclaw-looki] failed to register tool ${tool.name}: ${String(err)}`,
        );
      }
    }
    api.registerChannel({ plugin: lookiPlugin });
  },
};
