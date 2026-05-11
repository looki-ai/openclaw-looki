import { note, select } from "@clack/prompts";

import {
  runForwardSelectionFlow,
  type ForwardDraftTarget,
} from "@looki-ai/openclaw-looki/shared";

import type { OpenclawConfig } from "./config-io.js";
import type { Translator } from "./i18n.js";
import { makeGuardCancel } from "./ui.js";

export async function runForwardWizard(
  t: Translator,
  config: OpenclawConfig,
): Promise<ForwardDraftTarget[]> {
  const guardCancel = makeGuardCancel(t);
  return runForwardSelectionFlow({
    cfg: config,
    t,
    prompter: {
      note: async (message, title) => {
        await note(message, title);
      },
      select: async (params) => guardCancel(await select<string>(params)),
    },
  });
}
