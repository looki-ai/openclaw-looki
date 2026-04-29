import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";

import { lookiPlugin } from "./src/channel/plugin.js";
import { setLookiRuntime } from "./src/channel/runtime.js";
import {
  LOOKI_MEMORY_TOOL_DESCRIPTION,
  LOOKI_MEMORY_TOOL_LABEL,
  LOOKI_MEMORY_TOOL_NAME,
  LOOKI_MEMORY_TOOL_PARAMETERS,
  makeLookiMemoryExecute,
} from "./src/tools/memory-tool.js";

export default {
  id: "openclaw-looki",
  name: "Looki",
  description: "Looki inbound event channel (long-poll, inbound-only)",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    if (api.runtime) {
      setLookiRuntime(api.runtime);
    }
    api.registerTool({
      name: LOOKI_MEMORY_TOOL_NAME,
      label: LOOKI_MEMORY_TOOL_LABEL,
      description: LOOKI_MEMORY_TOOL_DESCRIPTION,
      parameters: LOOKI_MEMORY_TOOL_PARAMETERS,
      execute: makeLookiMemoryExecute(() => api.config, api.logger),
    });
    api.registerChannel({ plugin: lookiPlugin });
  },
};
