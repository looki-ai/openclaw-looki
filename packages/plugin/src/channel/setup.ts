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
  listForwardSessionsForChannel,
  buildInitialDraftValues,
  buildInitialDraftAccountIds,
  buildInitialDraftAgentIds,
  buildInitialDraftPeerKinds,
  buildInitialDraftSessionKeys,
  buildForwardTargetsFromDraft,
  computeInitialValidTargetIds,
  type ForwardDraftMap,
  type ForwardPeerKindDraftMap,
  type ForwardSessionCandidate,
} from "../shared/index.js";

let wizardLocale: Locale = DEFAULT_LOCALE;
const MESSAGES = loadLocaleMessages();
const tw = createTranslator(MESSAGES, () => wizardLocale);

function getBaseUrlOptions() {
  return [
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
}

function patchLookiConfig(cfg: OpenClawConfig, patch: Record<string, unknown>): OpenClawConfig {
  return patchLookiChannelConfig(
    cfg as Parameters<typeof patchLookiChannelConfig>[0],
    patch,
  ) as OpenClawConfig;
}

function formatSessionHint(entry: ForwardSessionCandidate): string {
  const parts: string[] = [entry.peerKind === "group" ? "group" : "direct"];
  if (entry.accountId && entry.accountId !== "default") parts.push(`@ ${entry.accountId}`);
  if (entry.peerId && entry.peerId !== entry.to) parts.push(entry.peerId);
  return parts.join(" · ");
}

async function configureForwardTargets(params: {
  cfg: OpenClawConfig;
  prompter: WizardPrompter;
  availableTargets: SupportedForwardPlugin[];
  sessionsByChannel: Map<string, ForwardSessionCandidate[]>;
}): Promise<LookiForwardTarget[]> {
  const { cfg, prompter, availableTargets, sessionsByChannel } = params;
  const cfgShape = cfg as Parameters<typeof buildInitialDraftValues>[0];
  const draftValues: ForwardDraftMap = buildInitialDraftValues(cfgShape, availableTargets);
  const draftAccountIds: ForwardDraftMap = buildInitialDraftAccountIds(cfgShape, availableTargets);
  const draftSessionKeys: ForwardDraftMap = buildInitialDraftSessionKeys(cfgShape, availableTargets);
  const draftPeerKinds: ForwardPeerKindDraftMap = buildInitialDraftPeerKinds(
    cfgShape,
    availableTargets,
  );
  const draftAgentIds: ForwardDraftMap = buildInitialDraftAgentIds(cfgShape, availableTargets);
  const validTargetIds = new Set(
    computeInitialValidTargetIds(availableTargets, draftValues, draftSessionKeys, draftPeerKinds),
  );
  const doneValue = "__done__";

  const currentHint = (target: SupportedForwardPlugin): string => {
    const to = draftValues[target.id];
    if (!to) return tw("forward.emptyHint");
    const accountId = draftAccountIds[target.id] || defaultForwardAccountId(target);
    const bits = [to];
    if (accountId && accountId !== "default") bits.push(`@ ${accountId}`);
    return tw("forward.configuredHint", { value: bits.join(" · ") });
  };

  const buildPluginListOptions = () => {
    const options = availableTargets.map((target) => {
      const configured = validTargetIds.has(target.id);
      return {
        value: target.id,
        label: `${configured ? "◼" : "◻"} ${target.label}`,
        hint: currentHint(target),
      };
    });
    options.push({
      value: doneValue,
      label: tw("forward.doneLabel"),
      hint: tw("forward.doneHint", { count: validTargetIds.size }),
    });
    return options;
  };

  while (true) {
    await prompter.note(tw("listControls.body"), tw("listControls.title"));
    const firstChoice = validTargetIds.values().next().value;
    const choice: string = await prompter.select({
      message: tw("forward.targetMessage"),
      options: buildPluginListOptions(),
      initialValue: firstChoice ?? availableTargets[0]?.id ?? doneValue,
    });

    if (choice === doneValue) {
      return buildForwardTargetsFromDraft(
        availableTargets,
        [...validTargetIds],
        draftValues,
        draftAccountIds,
        draftSessionKeys,
        draftPeerKinds,
        draftAgentIds,
      );
    }

    const target = availableTargets.find((item) => item.id === choice);
    if (!target) continue;

    const sessions = sessionsByChannel.get(target.channel) ?? [];
    const CLEAR_VALUE = "__clear__";
    const BACK_VALUE = "__back__";

    const sessionOptions = sessions.map((entry, index) => ({
      value: String(index),
      label: entry.label || entry.peerId || entry.to,
      hint: formatSessionHint(entry),
    }));
    if (validTargetIds.has(target.id)) {
      sessionOptions.push({
        value: CLEAR_VALUE,
        label: tw("action.clear"),
        hint: tw("action.clearHint"),
      });
    }
    sessionOptions.push({
      value: BACK_VALUE,
      label: tw("action.back"),
      hint: tw("action.backHint"),
    });

    const currentSessionKey = draftSessionKeys[target.id];
    const currentTo = draftValues[target.id];
    const matchedIndex = currentSessionKey
      ? sessions.findIndex((entry) => entry.sessionKey === currentSessionKey)
      : currentTo
        ? sessions.findIndex((entry) => entry.to === currentTo || entry.peerId === currentTo)
        : -1;

    const sessionChoice: string = await prompter.select({
      message: tw("session.message", { label: target.label }),
      options: sessionOptions,
      initialValue: matchedIndex >= 0 ? String(matchedIndex) : sessionOptions[0]?.value,
    });

    if (sessionChoice === BACK_VALUE) continue;
    if (sessionChoice === CLEAR_VALUE) {
      draftValues[target.id] = "";
      draftAccountIds[target.id] = defaultForwardAccountId(target) || "";
      delete draftSessionKeys[target.id];
      delete draftPeerKinds[target.id];
      delete draftAgentIds[target.id];
      validTargetIds.delete(target.id);
      continue;
    }

    const picked = sessions[Number(sessionChoice)];
    if (!picked) continue;
    draftValues[target.id] = picked.to;
    draftAccountIds[target.id] = picked.accountId;
    draftSessionKeys[target.id] = picked.sessionKey;
    draftPeerKinds[target.id] = picked.peerKind;
    draftAgentIds[target.id] = picked.agentId ?? "";
    validTargetIds.add(target.id);
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
      message: MESSAGES.en["language.messageCli"] as string,
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
    const detected = [
      ...detectForwardTargets(cfg as Parameters<typeof detectForwardTargets>[0]),
    ];
    if (detected.length === 0) {
      await prompter.note(tw("plugin.none"), tw("plugin.title"));
      return {
        cfg: patchLookiConfig(cfg, {
          enabled: true,
          accountId: DEFAULT_ACCOUNT_ID,
          forwardTo: [],
        }),
      };
    }

    const sessionsByChannel = new Map<string, ForwardSessionCandidate[]>();
    for (const target of detected) {
      sessionsByChannel.set(target.channel, listForwardSessionsForChannel(target.channel));
    }
    const availableTargets = detected.filter(
      (target) => (sessionsByChannel.get(target.channel) ?? []).length > 0,
    );
    const disabledTargets = detected.filter(
      (target) => (sessionsByChannel.get(target.channel) ?? []).length === 0,
    );

    if (availableTargets.length === 0) {
      await prompter.note(
        tw("plugin.detectedNoSessions", {
          labels: detected.map((target) => target.label).join(", "),
        }),
        tw("plugin.title"),
      );
      return {
        cfg: patchLookiConfig(cfg, {
          enabled: true,
          accountId: DEFAULT_ACCOUNT_ID,
          forwardTo: [],
        }),
      };
    }

    const detectedLine = tw("plugin.detected", {
      labels: availableTargets.map((target) => target.label).join(", "),
    });
    const disabledLine =
      disabledTargets.length > 0
        ? tw("plugin.noSessionsSuffix", {
            labels: disabledTargets.map((target) => target.label).join(", "),
          })
        : "";
    await prompter.note(
      [detectedLine, disabledLine].filter(Boolean).join("\n"),
      tw("plugin.title"),
    );

    const forwardTo = await configureForwardTargets({
      cfg,
      prompter,
      availableTargets,
      sessionsByChannel,
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
