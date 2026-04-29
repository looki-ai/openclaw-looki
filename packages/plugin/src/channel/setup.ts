import type { ChannelSetupWizard, OpenClawConfig, WizardPrompter } from "openclaw/plugin-sdk/setup";

import { type LookiForwardTarget } from "../forwarding/types.js";
import { DEFAULT_ACCOUNT_ID, resolveLookiAccount } from "../looki/account.js";
import {
  CHANNEL_ID,
  DEFAULT_LOCALE,
  GLOBAL_BASE_URL,
  CHINA_BASE_URL,
  UI_LANGUAGE_OPTIONS,
  type Locale,
  type SupportedForwardPlugin,
  defaultForwardAccountId,
  loadLocaleMessages,
  createTranslator,
  patchLookiChannelConfig,
  detectForwardTargets,
  getWeixinAccountIds,
  getWeixinContextUserIds,
  getQQBotKnownTargets,
  isValidFeishuTo,
  buildInitialDraftValues,
  buildInitialDraftAccountIds,
  buildForwardTargetsFromDraft,
  computeInitialValidTargetIds,
  formatDraftHint,
  isForwardTargetDraftValid,
  readFeishuAllowFrom,
  type ForwardDraftMap,
} from "../shared/index.js";

let wizardLocale: Locale = DEFAULT_LOCALE;
const MESSAGES = loadLocaleMessages();
const tw = createTranslator(MESSAGES, () => wizardLocale);

function getBaseUrlOptions() {
  return [
    { value: GLOBAL_BASE_URL, label: tw("env.optionGlobal"), hint: tw("env.hintGlobal") },
    { value: CHINA_BASE_URL, label: tw("env.optionChina"), hint: tw("env.hintChina") },
  ];
}

function patchLookiConfig(cfg: OpenClawConfig, patch: Record<string, unknown>): OpenClawConfig {
  return patchLookiChannelConfig(
    cfg as Parameters<typeof patchLookiChannelConfig>[0],
    patch,
  ) as OpenClawConfig;
}

function asConfigShape(cfg: OpenClawConfig): Parameters<typeof readFeishuAllowFrom>[0] {
  return cfg as Parameters<typeof readFeishuAllowFrom>[0];
}

function buildForwardSelectionOptions(
  targets: SupportedForwardPlugin[],
  validTargetIds: string[],
  draftValues: ForwardDraftMap,
  draftAccountIds: ForwardDraftMap,
  doneValue: string,
): Array<{ value: string; label: string; hint: string }> {
  const options: Array<{ value: string; label: string; hint: string }> = targets.map((target) => {
    const currentValue = formatDraftHint(target, draftValues, draftAccountIds);
    const configured = validTargetIds.includes(target.id);
    return {
      value: target.id,
      label: `${configured ? "◼" : "◻"} ${target.label}`,
      hint: configured
        ? tw("forward.configuredHint", { value: currentValue })
        : currentValue
          ? tw("forward.invalidHint", { value: currentValue })
          : tw("forward.emptyHint"),
    };
  });
  options.push({
    value: doneValue,
    label: tw("forward.doneLabel"),
    hint: tw("forward.doneHint", { count: validTargetIds.length }),
  });
  return options;
}

async function noteForwardListControls(prompter: WizardPrompter) {
  await prompter.note(tw("listControls.body"), tw("listControls.title"));
}

async function promptTargetAction(params: {
  prompter: WizardPrompter;
  target: SupportedForwardPlugin;
  configured: boolean;
}) {
  await params.prompter.note(
    params.configured ? tw("pageControls.configured") : tw("pageControls.unconfigured"),
    tw("pageControls.title"),
  );

  if (!params.configured) return "edit";

  return await params.prompter.select({
    message: tw("action.message", { label: params.target.label }),
    options: [
      { value: "edit", label: tw("action.edit"), hint: tw("action.editHint") },
      { value: "clear", label: tw("action.clear"), hint: tw("action.clearHint") },
      { value: "back", label: tw("action.back"), hint: tw("action.backHint") },
    ],
    initialValue: "edit",
  });
}

async function promptTextWithBack(params: {
  prompter: WizardPrompter;
  message: string;
  placeholder?: string;
  initialValue?: string;
  validate?: (input: string) => string | undefined;
}) {
  try {
    const value = await params.prompter.text({
      message: params.message,
      placeholder: params.placeholder,
      initialValue: params.initialValue,
      validate: params.validate ? (input) => params.validate!(String(input ?? "")) : undefined,
    });
    return String(value).trim();
  } catch (error) {
    if (error instanceof Error && error.name === "WizardCancelledError") {
      return null;
    }
    throw error;
  }
}

async function promptFeishuToWithBack(params: {
  prompter: WizardPrompter;
  initialValue?: string;
  candidates: string[];
}) {
  return promptTextWithBack({
    prompter: params.prompter,
    message: tw("feishu.toMessage"),
    placeholder: "ou_xxx",
    initialValue: params.initialValue,
    validate: (input) =>
      isValidFeishuTo(input, params.candidates) ? undefined : tw("feishu.invalidAllowFrom"),
  });
}

async function promptWeixinTargetWithBack(params: {
  prompter: WizardPrompter;
  initialTo?: string;
  initialAccountId?: string;
}) {
  await params.prompter.note(tw("weixin.targetHelp"), tw("weixin.targetHelpTitle"));

  const accountIds = getWeixinAccountIds();
  if (accountIds.length > 0) {
    await params.prompter.note(
      tw("weixin.accountsDetected", { values: accountIds.join(", ") }),
      tw("weixin.accountsTitle"),
    );
  }

  const accountId = await promptTextWithBack({
    prompter: params.prompter,
    message: tw("weixin.accountIdMessage"),
    placeholder: accountIds[0] || "weixin-account-id",
    initialValue: params.initialAccountId || accountIds[0] || undefined,
    validate: (input) => (String(input ?? "").trim() ? undefined : tw("field.required")),
  });
  if (accountId === null) return null;

  const userIds = getWeixinContextUserIds(accountId);
  if (userIds.length > 0) {
    await params.prompter.note(
      tw("weixin.usersDetected", { values: userIds.join(", ") }),
      tw("weixin.usersTitle"),
    );
  }

  const to = await promptTextWithBack({
    prompter: params.prompter,
    message: tw("weixin.toMessage"),
    placeholder: userIds[0] || "weixin_user_id",
    initialValue: params.initialTo || userIds[0] || undefined,
    validate: (input) => (String(input ?? "").trim() ? undefined : tw("field.required")),
  });
  if (to === null) return null;

  return { accountId, to };
}

async function promptQQBotTargetWithBack(params: {
  prompter: WizardPrompter;
  target: SupportedForwardPlugin;
  initialTo?: string;
  initialAccountId?: string;
}) {
  await params.prompter.note(tw("qqbot.targetHelp"), tw("qqbot.targetHelpTitle"));

  const knownTargets = getQQBotKnownTargets();
  const accountIds = [...new Set(knownTargets.map((entry) => entry.accountId).filter(Boolean))];
  const defaultAccountId =
    params.initialAccountId || accountIds[0] || defaultForwardAccountId(params.target) || undefined;

  if (knownTargets.length > 0) {
    await params.prompter.note(
      tw("qqbot.targetsDetected", {
        values: knownTargets
          .map((entry) =>
            [entry.accountId ? `accountId=${entry.accountId}` : "", `to=${entry.to}`]
              .filter(Boolean)
              .join(" "),
          )
          .join(", "),
      }),
      tw("qqbot.targetsTitle"),
    );
  }

  const accountId = await promptTextWithBack({
    prompter: params.prompter,
    message: tw("qqbot.accountIdMessage"),
    placeholder: defaultAccountId || "default",
    initialValue: defaultAccountId,
  });
  if (accountId === null) return null;

  const matchedTargets = knownTargets.filter(
    (entry) => !accountId || entry.accountId === accountId,
  );
  const defaultTo = params.initialTo || matchedTargets[0]?.to || knownTargets[0]?.to || undefined;

  const to = await promptTextWithBack({
    prompter: params.prompter,
    message: tw("qqbot.toMessage"),
    placeholder: defaultTo || "qqbot:c2c:<user_openid>",
    initialValue: defaultTo,
    validate: (input) => (String(input ?? "").trim() ? undefined : tw("field.required")),
  });
  if (to === null) return null;

  return { accountId, to };
}

async function promptGenericTargetWithBack(params: {
  prompter: WizardPrompter;
  target: SupportedForwardPlugin;
  initialTo?: string;
  initialAccountId?: string;
}) {
  const accountId = await promptTextWithBack({
    prompter: params.prompter,
    message: tw("generic.accountIdMessage", { label: params.target.label }),
    placeholder: defaultForwardAccountId(params.target) || "default",
    initialValue: params.initialAccountId || defaultForwardAccountId(params.target) || undefined,
  });
  if (accountId === null) return null;

  const to = await promptTextWithBack({
    prompter: params.prompter,
    message: tw("generic.toMessage", { label: params.target.label }),
    placeholder: params.target.placeholder,
    initialValue: params.initialTo || undefined,
    validate: (input) => (String(input ?? "").trim() ? undefined : tw("field.required")),
  });
  if (to === null) return null;

  return { accountId, to };
}

async function configureForwardTargets(params: {
  cfg: OpenClawConfig;
  prompter: WizardPrompter;
  availableTargets: SupportedForwardPlugin[];
}): Promise<LookiForwardTarget[]> {
  const { cfg, prompter, availableTargets } = params;
  const cfgShape = asConfigShape(cfg);
  const existingAllowFrom = readFeishuAllowFrom(cfgShape);
  const draftValues = buildInitialDraftValues(cfgShape, availableTargets);
  const draftAccountIds = buildInitialDraftAccountIds(cfgShape, availableTargets);
  const validTargetIds = new Set(
    computeInitialValidTargetIds(availableTargets, draftValues, draftAccountIds, existingAllowFrom),
  );
  const doneValue = "__done__";

  const refreshValidity = (target: SupportedForwardPlugin): void => {
    if (isForwardTargetDraftValid(target, draftValues, draftAccountIds, existingAllowFrom)) {
      validTargetIds.add(target.id);
    } else {
      validTargetIds.delete(target.id);
    }
  };

  while (true) {
    await noteForwardListControls(prompter);
    const idsList = [...validTargetIds];
    const choice: string = await prompter.select({
      message: tw("forward.targetMessage"),
      options: buildForwardSelectionOptions(
        availableTargets,
        idsList,
        draftValues,
        draftAccountIds,
        doneValue,
      ),
      initialValue: idsList[0] ?? availableTargets[0]?.id ?? doneValue,
    });

    if (choice === doneValue) {
      return buildForwardTargetsFromDraft(
        availableTargets,
        [...validTargetIds],
        draftValues,
        draftAccountIds,
      );
    }

    const target = availableTargets.find((item) => item.id === choice);
    if (!target) continue;
    const configured = validTargetIds.has(target.id);
    const action = await promptTargetAction({ prompter, target, configured });
    if (action === "back") continue;
    if (action === "clear") {
      draftValues[target.id] = "";
      draftAccountIds[target.id] = "";
      validTargetIds.delete(target.id);
      continue;
    }

    if (target.channel === "feishu") {
      if (existingAllowFrom.length > 0) {
        await prompter.note(
          tw("feishu.allowFromDetected", { values: existingAllowFrom.join(", ") }),
          tw("feishu.allowFromTitle"),
        );
      } else {
        await prompter.note(tw("feishu.allowFromEmpty"), tw("feishu.allowFromTitle"));
      }
      const value = await promptFeishuToWithBack({
        prompter,
        initialValue: draftValues[choice] || undefined,
        candidates: existingAllowFrom,
      });
      if (value === null) continue;
      draftValues[choice] = value;
    } else if (target.channel === "openclaw-weixin") {
      const value = await promptWeixinTargetWithBack({
        prompter,
        initialTo: draftValues[choice] || undefined,
        initialAccountId: draftAccountIds[choice] || undefined,
      });
      if (value === null) continue;
      draftValues[choice] = value.to;
      draftAccountIds[choice] = value.accountId;
    } else if (target.channel === "qqbot") {
      const value = await promptQQBotTargetWithBack({
        prompter,
        target,
        initialTo: draftValues[choice] || undefined,
        initialAccountId: draftAccountIds[choice] || undefined,
      });
      if (value === null) continue;
      draftValues[choice] = value.to;
      draftAccountIds[choice] = value.accountId;
    } else {
      const value = await promptGenericTargetWithBack({
        prompter,
        target,
        initialTo: draftValues[choice] || undefined,
        initialAccountId: draftAccountIds[choice] || undefined,
      });
      if (value === null) continue;
      draftValues[choice] = value.to;
      draftAccountIds[choice] = value.accountId;
    }

    refreshValidity(target);
  }
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
      message: `${MESSAGES.en["language.messageCli"]} / ${MESSAGES["zh-CN"]["language.messageCli"]}`,
      options: [...UI_LANGUAGE_OPTIONS],
      initialValue: DEFAULT_LOCALE,
    });

    const baseUrlOptions = getBaseUrlOptions();
    const currentBaseUrl = resolveLookiAccount(cfg).baseUrl;
    const initialBaseUrl =
      baseUrlOptions.find((option) => option.value === currentBaseUrl)?.value ??
      baseUrlOptions[0].value;

    const baseUrl = await prompter.select({
      message: tw("env.message"),
      options: baseUrlOptions.map((option) => ({
        value: option.value,
        label: option.label,
        hint: option.hint,
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
    const availableTargets = [
      ...detectForwardTargets(cfg as Parameters<typeof detectForwardTargets>[0]),
    ];
    if (availableTargets.length === 0) {
      await prompter.note(tw("plugin.none"), tw("plugin.title"));
      return {
        cfg: patchLookiConfig(cfg, {
          enabled: true,
          accountId: DEFAULT_ACCOUNT_ID,
          forwardTo: [],
        }),
      };
    }
    await prompter.note(
      tw("plugin.detected", { labels: availableTargets.map((target) => target.label).join(", ") }),
      tw("plugin.title"),
    );
    const forwardTo = await configureForwardTargets({
      cfg,
      prompter,
      availableTargets,
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
