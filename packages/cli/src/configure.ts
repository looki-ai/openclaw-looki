import { note, select, text } from "@clack/prompts";

import {
  CHANNEL_ID,
  CHINA_BASE_URL,
  DEFAULT_ACCOUNT_ID,
  DEFAULT_LOCALE,
  GLOBAL_BASE_URL,
  UI_LANGUAGE_OPTIONS,
  isValidBaseUrl,
  patchLookiChannelConfig,
  type Locale,
} from "@looki-ai/openclaw-looki/shared";

import { runForwardWizard } from "./forward-wizard.js";
import { log, makeGuardCancel } from "./ui.js";
import {
  ConfigReadError,
  getConfigPath,
  readConfig,
  writeConfig,
  type OpenclawConfig,
} from "./config-io.js";
import { MESSAGES, type Translator } from "./i18n.js";

export type ConfigureOverrides = {
  baseUrl?: string;
  apiKey?: string;
  locale?: Locale;
};

export type ConfigureResult = {
  config: OpenclawConfig;
  locale: Locale;
};

const CUSTOM_BASE_URL_VALUE = "__custom__";

function getBaseUrlOptions(t: Translator) {
  return [
    { label: "United States", value: GLOBAL_BASE_URL },
    { label: "United Kingdom", value: GLOBAL_BASE_URL },
    { label: "France", value: GLOBAL_BASE_URL },
    { label: "Spain", value: GLOBAL_BASE_URL },
    { label: "Japan", value: GLOBAL_BASE_URL },
    { label: "Canada", value: GLOBAL_BASE_URL },
    { label: "Australia", value: GLOBAL_BASE_URL },
    { label: "Russia", value: GLOBAL_BASE_URL },
    { label: "South Korea", value: GLOBAL_BASE_URL },
    { label: "Singapore", value: GLOBAL_BASE_URL },
    { label: "China", value: CHINA_BASE_URL },
    { label: t("env.optionCustom"), value: CUSTOM_BASE_URL_VALUE, hint: t("env.hintCustom") },
  ];
}

export function pickInitialLocale(overrides: ConfigureOverrides, saved: Locale | null): Locale {
  if (overrides.locale) return overrides.locale;
  if (saved) return saved;
  return DEFAULT_LOCALE;
}

export async function chooseLocale(
  initialLocale: Locale,
  overridden: boolean,
  t: Translator,
  setLocale: (next: Locale) => void,
): Promise<Locale> {
  if (overridden) {
    setLocale(initialLocale);
    return initialLocale;
  }
  // Use a neutral message key — we haven't committed to a locale yet.
  const guardCancel = makeGuardCancel(t);
  const neutralMessage = MESSAGES.en["language.messageCli"] as string;
  const next = guardCancel(
    await select<Locale>({
      message: neutralMessage,
      options: [...UI_LANGUAGE_OPTIONS],
      initialValue: initialLocale,
    }),
  );
  setLocale(next);
  return next;
}

function resolveInitialConfig(t: Translator): OpenclawConfig {
  try {
    return readConfig();
  } catch (err) {
    if (err instanceof ConfigReadError) {
      log(t("diagnose.configReadFail", { path: err.path }));
      throw err;
    }
    throw err;
  }
}

export async function runConfigure(
  t: Translator,
  setLocale: (next: Locale) => void,
  overrides: ConfigureOverrides = {},
): Promise<ConfigureResult> {
  const existing = resolveInitialConfig(t);
  const initialLocale = pickInitialLocale(overrides, null);
  const alreadyDecided = overrides.locale != null;
  const locale = await chooseLocale(initialLocale, alreadyDecided, t, setLocale);

  let baseUrl = overrides.baseUrl ?? "";
  if (!baseUrl) {
    const guardCancel = makeGuardCancel(t);
    const baseUrlOptions = getBaseUrlOptions(t);
    const currentBaseUrl = String(
      (existing.channels?.[CHANNEL_ID] as { baseUrl?: unknown } | undefined)?.baseUrl ?? "",
    ).trim();
    const presetMatch = baseUrlOptions.find(
      (option) => option.value !== CUSTOM_BASE_URL_VALUE && option.value === currentBaseUrl,
    );
    const initialBaseUrl =
      presetMatch?.value ??
      (currentBaseUrl ? CUSTOM_BASE_URL_VALUE : baseUrlOptions[0].value);

    await note(t("env.note"), t("env.title"));
    const selected = guardCancel(
      await select<string>({
        message: t("env.message"),
        options: baseUrlOptions,
        initialValue: initialBaseUrl,
      }),
    );

    if (selected === CUSTOM_BASE_URL_VALUE) {
      baseUrl = guardCancel(
        await text({
          message: t("env.customMessage"),
          placeholder: "https://open.dev.looki.ai",
          initialValue: currentBaseUrl || undefined,
          validate: (value) => {
            const trimmed = String(value ?? "").trim();
            if (!trimmed) return t("field.required");
            return isValidBaseUrl(trimmed) ? undefined : t("env.customInvalid");
          },
        }),
      ).trim();
    } else {
      baseUrl = selected;
    }
  }

  let apiKey = overrides.apiKey ?? "";
  if (!apiKey) {
    const guardCancel = makeGuardCancel(t);
    const currentApiKey = String(
      (existing.channels?.[CHANNEL_ID] as { apiKey?: unknown } | undefined)?.apiKey ?? "",
    ).trim();
    await note(t("apiKey.note"), t("apiKey.title"));
    const raw = guardCancel(
      await text({
        message: t("apiKey.message"),
        placeholder: "lk-...",
        initialValue: currentApiKey || undefined,
        validate: (value) => {
          const trimmed = String(value ?? "").trim();
          if (!trimmed && !currentApiKey) return t("field.required");
          return undefined;
        },
      }),
    );
    apiKey = (String(raw || "") || currentApiKey).trim();
  }

  const forwardTo = await runForwardWizard(t, existing);

  const nextConfig = patchLookiChannelConfig(existing, {
    enabled: true,
    baseUrl,
    apiKey,
    accountId: DEFAULT_ACCOUNT_ID,
    forwardTo,
  });

  writeConfig(nextConfig);
  await note(t("config.written", { path: getConfigPath() }), t("config.writtenTitle"));

  return { config: nextConfig, locale };
}
