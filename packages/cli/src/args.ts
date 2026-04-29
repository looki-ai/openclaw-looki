import { parseArgs } from "node:util";

import { isValidBaseUrl, type Locale } from "@looki-ai/openclaw-looki/shared";

export type CliCommand = "install" | "configure";

export type CliOptions = {
  command: CliCommand;
  baseUrl?: string;
  apiKey?: string;
  locale?: Locale;
  restart: boolean;
  positional: string[];
};

export class CliArgsError extends Error {
  constructor(
    message: string,
    public readonly keyHint?: string,
  ) {
    super(message);
    this.name = "CliArgsError";
  }
}

const VALID_LOCALES: readonly Locale[] = ["en", "es", "fr", "ja", "zh-CN"];

function parseLocale(value: string | undefined): Locale | undefined {
  if (value == null) return undefined;
  if (!VALID_LOCALES.includes(value as Locale)) {
    throw new CliArgsError(`invalid --locale: ${value}`, "cli.invalidFlagLocale");
  }
  return value as Locale;
}

function parseBaseUrl(value: string | undefined): string | undefined {
  if (value == null) return undefined;
  const trimmed = value.trim();
  if (!trimmed) {
    throw new CliArgsError("empty --base-url", "cli.invalidFlagBaseUrl");
  }
  if (!isValidBaseUrl(trimmed)) {
    throw new CliArgsError(`not a valid http(s) URL: ${trimmed}`, "cli.invalidFlagBaseUrl");
  }
  return trimmed;
}

function parseApiKey(value: string | undefined): string | undefined {
  if (value == null) return undefined;
  const trimmed = value.trim();
  if (!trimmed) {
    throw new CliArgsError("empty --api-key", "cli.invalidFlagApiKey");
  }
  return trimmed;
}

function isKnownCommand(value: string | undefined): value is CliCommand {
  return value === "install" || value === "configure" || value === "help";
}

export type CliArgsResult =
  | ({ kind: "run" } & CliOptions)
  | { kind: "help"; locale?: Locale; unknown?: string };

export function parseCliArgs(argv: string[]): CliArgsResult {
  // Node's parseArgs does not auto-negate booleans, so we strip --no-restart
  // out of argv ourselves and treat it as an explicit "restart=false".
  let restart = true;
  const filteredArgv: string[] = [];
  for (const arg of argv) {
    if (arg === "--no-restart") {
      restart = false;
      continue;
    }
    filteredArgv.push(arg);
  }

  let parsed;
  try {
    parsed = parseArgs({
      args: filteredArgv,
      options: {
        "base-url": { type: "string" },
        "api-key": { type: "string" },
        locale: { type: "string" },
        help: { type: "boolean", short: "h" },
      },
      allowPositionals: true,
      strict: true,
    });
  } catch (err) {
    throw new CliArgsError((err as Error).message, "cli.flagParseError");
  }

  const locale = parseLocale(parsed.values.locale as string | undefined);

  if (parsed.values.help) {
    return { kind: "help", locale };
  }

  const [maybeCommand, ...positional] = parsed.positionals;
  if (maybeCommand == null) {
    return { kind: "help", locale };
  }
  if (maybeCommand === "-h" || maybeCommand === "--help" || maybeCommand === "help") {
    return { kind: "help", locale };
  }
  if (!isKnownCommand(maybeCommand)) {
    return { kind: "help", locale, unknown: maybeCommand };
  }

  return {
    kind: "run",
    command: maybeCommand,
    baseUrl: parseBaseUrl(parsed.values["base-url"] as string | undefined),
    apiKey: parseApiKey(parsed.values["api-key"] as string | undefined),
    locale,
    restart,
    positional,
  };
}

export const KNOWN_LOCALES = VALID_LOCALES;
