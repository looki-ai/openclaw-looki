import { note, select } from "@clack/prompts";

import {
  runForwardSelectionFlow,
  type LookiForwardTarget,
} from "@looki-ai/openclaw-looki/shared";

import type { OpenClawConfig } from "./config-io.js";
import type { Translator } from "./i18n.js";
import { makeGuardCancel } from "./ui.js";

export async function runForwardWizard(
  t: Translator,
  config: OpenClawConfig,
): Promise<LookiForwardTarget[]> {
  const guardCancel = makeGuardCancel(t);
  return runForwardSelectionFlow({
    cfg: config,
    t,
    prompter: {
      note: async (message, title) => {
        note(message, title);
      },
      select: async (params) => guardCancel(await select<string>(params)),
    },
  });
}
