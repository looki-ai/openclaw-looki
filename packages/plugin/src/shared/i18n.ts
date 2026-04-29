import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_LOCALE, type Locale } from "./constants.js";

export type MessageParams = Record<string, string | number | boolean | undefined>;
export type MessageValue = string | { zero?: string; one?: string; other: string };
export type LocaleMessages = Record<string, MessageValue>;

function resolveI18nSearchDirs(): string[] {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  // When running from source: <repo>/src/shared -> <repo>/i18n
  // When running from dist:   <repo>/dist/src/shared -> <repo>/i18n
  // When consumed as dep:     node_modules/@looki-ai/openclaw-looki/dist/src/shared -> .../i18n
  return [
    path.resolve(currentDir, "../../i18n"),
    path.resolve(currentDir, "../../../i18n"),
    path.resolve(currentDir, "../../../../i18n"),
  ];
}

function isMessageValue(value: unknown): value is MessageValue {
  if (typeof value === "string") return true;
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.other !== "string") return false;
  if (record.zero !== undefined && typeof record.zero !== "string") return false;
  if (record.one !== undefined && typeof record.one !== "string") return false;
  // Only count plural-form keys — anything else means it's a nested group.
  const pluralKeys = new Set(["zero", "one", "other"]);
  return Object.keys(record).every((key) => pluralKeys.has(key));
}

function flattenMessages(
  source: Record<string, unknown>,
  prefix: string,
  out: LocaleMessages,
): void {
  for (const [key, value] of Object.entries(source)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (isMessageValue(value)) {
      out[fullKey] = value;
    } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      flattenMessages(value as Record<string, unknown>, fullKey, out);
    } else {
      throw new Error(`Unsupported i18n value at ${fullKey}`);
    }
  }
}

function readLocaleMessages(locale: Locale): LocaleMessages {
  for (const dir of resolveI18nSearchDirs()) {
    const filePath = path.join(dir, `${locale}.json`);
    if (!fs.existsSync(filePath)) continue;
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Record<string, unknown>;
    const flat: LocaleMessages = {};
    flattenMessages(raw, "", flat);
    return flat;
  }
  throw new Error(`Missing openclaw-looki locale file: ${locale}.json`);
}

const SUPPORTED_LOCALES: readonly Locale[] = ["en", "es", "fr", "ja", "zh-CN"];

export function loadLocaleMessages(): Record<Locale, LocaleMessages> {
  const out = {} as Record<Locale, LocaleMessages>;
  for (const locale of SUPPORTED_LOCALES) {
    out[locale] = readLocaleMessages(locale);
  }
  return out;
}

function selectMessageTemplate(value: MessageValue, params: MessageParams): string {
  if (typeof value === "string") return value;
  const count = Number(params.count ?? 0);
  if (count === 0 && value.zero) return value.zero;
  if (count === 1 && value.one) return value.one;
  return value.other;
}

function interpolate(template: string, params: MessageParams): string {
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (match, key: string) =>
    params[key] === undefined ? match : String(params[key]),
  );
}

export type Translator = (key: string, params?: MessageParams) => string;

export function createTranslator(
  messages: Record<Locale, LocaleMessages>,
  getLocale: () => Locale,
  globalParams: MessageParams = {},
): Translator {
  return (key, params = {}) => {
    const merged = { ...globalParams, ...params };
    const locale = getLocale();
    const value = messages[locale]?.[key] ?? messages[DEFAULT_LOCALE][key] ?? key;
    return interpolate(selectMessageTemplate(value, merged), merged);
  };
}
