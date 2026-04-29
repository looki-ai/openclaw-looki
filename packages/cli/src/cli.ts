#!/usr/bin/env node
import { intro, outro, spinner } from "@clack/prompts";

import {
  DEFAULT_LOCALE,
  MIN_OPENCLAW_VERSION,
  PLUGIN_SPEC,
  type Locale,
} from "@looki-ai/openclaw-looki/shared";

import { CliArgsError, parseCliArgs, type CliOptions } from "./args.js";
import { runConfigure } from "./configure.js";
import { makeTranslator, type Translator } from "./i18n.js";
import { error, log } from "./ui.js";
import {
  ensureHostVersion,
  ensureOpenclawInstalled,
  getCliVersion,
  getInstalledPluginVersion,
  installPlugin,
  restartGateway,
} from "./openclaw-cli.js";

let currentLocale: Locale = DEFAULT_LOCALE;

function setLocale(next: Locale): void {
  currentLocale = next;
}

const t: Translator = makeTranslator(() => currentLocale, {
  pluginSpec: PLUGIN_SPEC,
  minOpenclawVersion: MIN_OPENCLAW_VERSION,
});

function initLocale(options: CliOptions): void {
  if (options.locale) {
    setLocale(options.locale);
    return;
  }
}

function printHelp(): void {
  console.log(`
${t("help.usage")}

${t("help.commands")}
${t("help.install")}
${t("help.configure")}
${t("help.help")}

${t("help.optionsTitle")}
${t("help.optionBaseUrl")}
${t("help.optionApiKey")}
${t("help.optionLocale")}
${t("help.optionNoRestart")}
`);
}

function shouldSkipProgressLine(line: string): boolean {
  if (!line) return true;
  if (/^[│├╰─╮╯╭┌└]+$/u.test(line)) return true;
  if (line.startsWith("│") || line.startsWith("├") || line.startsWith("╰") || line.startsWith("╭")) {
    return true;
  }
  if (/^(?:◇|◆|⚠|✓|✗)/u.test(line)) return true;
  if (/^Config warnings/i.test(line)) return true;
  return false;
}

async function runInstall(options: CliOptions): Promise<void> {
  intro(t("wizard.intro"));
  log(`CLI version: ${getCliVersion() ?? "not installed"}`);
  ensureOpenclawInstalled(t);
  ensureHostVersion(t);

  const versionBefore = getInstalledPluginVersion();
  log(`Plugin current version: ${versionBefore ?? "not installed"}`);

  const progress = spinner();
  progress.start(t("install.start"));
  await installPlugin(t, {
    onLine: (line) => {
      if (shouldSkipProgressLine(line)) return;
      progress.message(line);
    },
    onProgress: (stage) => {
      if (stage === "install-done") progress.stop(t("install.done"));
    },
  });

  const versionAfter = getInstalledPluginVersion();
  log(`Plugin updated version: ${versionAfter ?? "not installed"}`);

  await runConfigure(t, setLocale, {
    baseUrl: options.baseUrl,
    apiKey: options.apiKey,
    locale: options.locale,
  });

  if (options.restart) {
    const restartProgress = spinner();
    restartProgress.start(t("restart.start"));
    restartGateway(t);
    restartProgress.stop(t("restart.done"));
  }
  outro(t("wizard.outro"));
}

async function runConfigureCommand(options: CliOptions): Promise<void> {
  intro(t("wizard.intro"));
  await runConfigure(t, setLocale, {
    baseUrl: options.baseUrl,
    apiKey: options.apiKey,
    locale: options.locale,
  });
  if (options.restart) {
    const restartProgress = spinner();
    restartProgress.start(t("restart.start"));
    restartGateway(t);
    restartProgress.stop(t("restart.done"));
  }
  outro(t("wizard.outro"));
}

async function main(): Promise<number> {
  let parsed;
  try {
    parsed = parseCliArgs(process.argv.slice(2));
  } catch (err) {
    if (err instanceof CliArgsError) {
      const hintKey = err.keyHint;
      if (hintKey === "cli.invalidFlagLocale") {
        error(t(hintKey, { values: "zh-CN, en" }));
      } else if (hintKey === "cli.flagParseError" || !hintKey) {
        error(t("cli.flagParseError", { message: err.message }));
      } else {
        error(t(hintKey));
      }
      return 1;
    }
    throw err;
  }

  if (parsed.locale) setLocale(parsed.locale);

  if (parsed.kind === "help") {
    if (parsed.unknown) {
      error(t("cli.unknownCommand", { command: parsed.unknown }));
      printHelp();
      return 1;
    }
    printHelp();
    return 0;
  }

  initLocale(parsed);

  if (parsed.command === "install") {
    await runInstall(parsed);
    return 0;
  }
  if (parsed.command === "configure") {
    await runConfigureCommand(parsed);
    return 0;
  }
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    error(String(err instanceof Error ? err.message : err));
    if (err instanceof Error && err.stack) {
      console.error(err.stack);
    }
    process.exit(1);
  },
);
