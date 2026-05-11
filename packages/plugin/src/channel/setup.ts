import type { ChannelSetupWizard, OpenClawConfig } from "openclaw/plugin-sdk/setup";

import { DEFAULT_ACCOUNT_ID, resolveLookiAccount } from "../looki/account.js";
import {
  CHANNEL_ID,
  DEFAULT_LOCALE,
  GLOBAL_BASE_URL,
  CHINA_BASE_URL,
  UI_LANGUAGE_OPTIONS,
  type Locale,
  loadLocaleMessages,
  createTranslator,
  patchLookiChannelConfig,
  runForwardSelectionFlow,
} from "../shared/index.js";

let wizardLocale: Locale = DEFAULT_LOCALE;
const MESSAGES = loadLocaleMessages();
const tw = createTranslator(MESSAGES, () => wizardLocale);

// All non-China locales currently share the global endpoint; the per-country
// labels exist so users find the option by the country they're in.
const BASE_URL_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: GLOBAL_BASE_URL, label: "United States" },
  { value: GLOBAL_BASE_URL, label: "United Kingdom" },
  { value: GLOBAL_BASE_URL, label: "France" },
  { value: GLOBAL_BASE_URL, label: "Spain" },
  { value: GLOBAL_BASE_URL, label: "Japan" },
  { value: GLOBAL_BASE_URL, label: "Canada" },
  { value: GLOBAL_BASE_URL, label: "Australia" },
  { value: GLOBAL_BASE_URL, label: "Russia" },
  { value: GLOBAL_BASE_URL, label: "South Korea" },
  { value: GLOBAL_BASE_URL, label: "Singapore" },
  { value: CHINA_BASE_URL, label: "China" },
];

// Thin type bridge: plugin-sdk's `OpenClawConfig` and our internal
// `OpenClawConfigShape` (from shared/config.ts) are structurally compatible
// but nominally different, so we cast in one place instead of 5 call sites.
function patchLookiConfig(cfg: OpenClawConfig, patch: Record<string, unknown>): OpenClawConfig {
  return patchLookiChannelConfig(
    cfg as Parameters<typeof patchLookiChannelConfig>[0],
    patch,
  ) as OpenClawConfig;
}

export const lookiSetupWizard: ChannelSetupWizard = {
  channel: CHANNEL_ID,
  status: {
    configuredLabel: "configured",
    unconfiguredLabel: "needs baseUrl + apiKey",
    configuredHint: "configured",
    unconfiguredHint: "needs apiKey",
    configuredScore: 2,
    unconfiguredScore: 0,
    resolveConfigured: ({ cfg }) => resolveLookiAccount(cfg).configured,
    resolveStatusLines: ({ cfg, configured }) => {
      const account = resolveLookiAccount(cfg);
      return [
        configured
          ? tw("status.configured", { baseUrl: account.baseUrl })
          : tw("status.unconfigured"),
        tw("status.forwardCount", { count: account.forwardTo.length }),
      ];
    },
  },
  introNote: {
    title: tw("wizard.introTitle"),
    lines: [tw("wizard.introLine1"), tw("wizard.introLine2")],
  },
  credentials: [],
  prepare: async ({ cfg, prompter }) => {
    wizardLocale = await prompter.select({
      message: MESSAGES.en["language.messageCli"] as string,
      options: [...UI_LANGUAGE_OPTIONS],
      initialValue: DEFAULT_LOCALE,
    });

    const currentBaseUrl = resolveLookiAccount(cfg).baseUrl;
    const initialBaseUrl =
      BASE_URL_OPTIONS.find((option) => option.value === currentBaseUrl)?.value ??
      BASE_URL_OPTIONS[0].value;

    const baseUrl = await prompter.select({
      message: tw("env.message"),
      options: BASE_URL_OPTIONS.map((option) => ({
        value: option.value,
        label: option.label,
      })),
      initialValue: initialBaseUrl,
    });

    return {
      cfg: patchLookiConfig(cfg, {
        enabled: true,
        accountId: DEFAULT_ACCOUNT_ID,
        baseUrl,
      }),
    };
  },
  textInputs: [
    {
      inputKey: "token",
      message: tw("apiKey.message"),
      placeholder: "lk-...",
      required: true,
      initialValue: ({ cfg }) => {
        const apiKey = resolveLookiAccount(cfg).apiKey;
        return apiKey || undefined;
      },
      validate: ({ value }) => (String(value ?? "").trim() ? undefined : tw("field.required")),
      applySet: ({ cfg, value }) =>
        patchLookiConfig(cfg, {
          enabled: true,
          accountId: DEFAULT_ACCOUNT_ID,
          apiKey: value.trim(),
        }),
    },
  ],
  finalize: async ({ cfg, prompter }) => {
    const forwardTo = await runForwardSelectionFlow({
      cfg: cfg as Parameters<typeof runForwardSelectionFlow>[0]["cfg"],
      prompter,
      t: tw,
    });
    return {
      cfg: patchLookiConfig(cfg, {
        enabled: true,
        accountId: DEFAULT_ACCOUNT_ID,
        forwardTo,
      }),
    };
  },
};
