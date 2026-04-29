import { defineSetupPluginEntry } from "openclaw/plugin-sdk/core";

import { lookiPlugin } from "./src/channel/plugin.js";

export default defineSetupPluginEntry(lookiPlugin);
