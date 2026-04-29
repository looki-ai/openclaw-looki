import { cancel, isCancel } from "@clack/prompts";

import type { Translator } from "./i18n.js";

const CYAN = "\x1b[36m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";

export function log(message: string): void {
  console.log(`${CYAN}[openclaw-looki]${RESET} ${message}`);
}

export function error(message: string): void {
  console.error(`${RED}[openclaw-looki]${RESET} ${message}`);
}

export function makeGuardCancel(t: Translator) {
  return function guardCancel<T>(value: T | symbol): T {
    if (isCancel(value)) {
      cancel(t("wizard.cancelled"));
      process.exit(0);
    }
    return value as T;
  };
}
