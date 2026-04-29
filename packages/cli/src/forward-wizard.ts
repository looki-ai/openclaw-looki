import { isCancel, note, select, text } from "@clack/prompts";

import {
  buildForwardTargetsFromDraft,
  buildInitialDraftAccountIds,
  buildInitialDraftValues,
  computeInitialValidTargetIds,
  defaultForwardAccountId,
  detectForwardTargets,
  formatDraftHint,
  getDiscordKnownTargets,
  getQQBotKnownTargets,
  getTelegramKnownTargets,
  getWeixinAccountIds,
  getWeixinContextUserIds,
  getWhatsappKnownTargets,
  isForwardTargetDraftValid,
  isValidFeishuTo,
  readFeishuAllowFrom,
  type ForwardDraftMap,
  type ForwardDraftTarget,
  type SupportedForwardPlugin,
} from "@looki-ai/openclaw-looki/shared";

import type { OpenclawConfig } from "./config-io.js";
import type { Translator } from "./i18n.js";
import { makeGuardCancel } from "./ui.js";

type DraftMap = ForwardDraftMap;

type ForwardTarget = ForwardDraftTarget;

async function promptTextOrBack(
  message: string,
  opts: {
    placeholder?: string;
    defaultValue?: string;
    validate?: (input: string) => string | undefined;
  } = {},
): Promise<string | null> {
  const result = await text({
    message,
    placeholder: opts.placeholder,
    initialValue: opts.defaultValue,
    validate: opts.validate ? (value) => opts.validate!(String(value ?? "")) : undefined,
  });
  if (isCancel(result)) return null;
  return String(result ?? "").trim();
}

export async function runForwardWizard(
  t: Translator,
  config: OpenclawConfig,
): Promise<ForwardTarget[]> {
  const guardCancel = makeGuardCancel(t);
  const availableTargets = detectForwardTargets(config);
  if (availableTargets.length === 0) {
    await note(t("plugin.none"), t("plugin.title"));
    return [];
  }

  await note(
    t("plugin.detected", { labels: availableTargets.map((target) => target.label).join("、") }),
    t("plugin.title"),
  );

  const existingAllowFrom = readFeishuAllowFrom(config);
  const draftValues = buildInitialDraftValues(config, availableTargets);
  const draftAccountIds = buildInitialDraftAccountIds(config, availableTargets);
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
    await note(t("listControls.body"), t("listControls.title"));
    const idsList = [...validTargetIds];
    const choice = guardCancel(
      await select({
        message: t("forward.targetMessage"),
        options: buildSelectionOptions(
          t,
          availableTargets,
          idsList,
          draftValues,
          draftAccountIds,
          doneValue,
        ),
        initialValue: idsList[0] || availableTargets[0]?.id || doneValue,
      }),
    );

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

    const action = await promptTargetAction(t, target, configured);
    if (action === "back") continue;
    if (action === "clear") {
      draftValues[target.id] = "";
      draftAccountIds[target.id] = defaultForwardAccountId(target) || "";
      validTargetIds.delete(target.id);
      continue;
    }

    if (target.channel === "feishu") {
      const value = await configureFeishuTarget(t, target, existingAllowFrom, draftValues);
      if (value === null) continue;
      draftValues[target.id] = value;
    } else if (target.channel === "openclaw-weixin") {
      const value = await configureWeixinTarget(t, target, draftValues, draftAccountIds);
      if (value === null) continue;
      draftValues[target.id] = value.to;
      draftAccountIds[target.id] = value.accountId;
    } else if (target.channel === "qqbot") {
      const value = await configureQQBotTarget(t, target, draftValues, draftAccountIds);
      if (value === null) continue;
      draftValues[target.id] = value.to;
      draftAccountIds[target.id] = value.accountId;
    } else if (target.channel === "discord") {
      const value = await configureDiscordTarget(t, target, draftValues, draftAccountIds);
      if (value === null) continue;
      draftValues[target.id] = value.to;
      draftAccountIds[target.id] = value.accountId;
    } else if (target.channel === "telegram") {
      const value = await configureTelegramTarget(t, target, draftValues, draftAccountIds);
      if (value === null) continue;
      draftValues[target.id] = value.to;
      draftAccountIds[target.id] = value.accountId;
    } else if (target.channel === "whatsapp") {
      const value = await configureWhatsappTarget(t, target, draftValues, draftAccountIds);
      if (value === null) continue;
      draftValues[target.id] = value.to;
      draftAccountIds[target.id] = value.accountId;
    } else {
      const value = await configureGenericTarget(t, target, draftValues, draftAccountIds);
      if (value === null) continue;
      draftValues[target.id] = value.to;
      draftAccountIds[target.id] = value.accountId;
    }

    refreshValidity(target);
  }
}

function buildSelectionOptions(
  t: Translator,
  targets: readonly SupportedForwardPlugin[],
  validTargetIds: string[],
  draftValues: DraftMap,
  draftAccountIds: DraftMap,
  doneValue: string,
): Array<{ value: string; label: string; hint?: string }> {
  const options = targets.map((target) => {
    const currentValue = formatDraftHint(target, draftValues, draftAccountIds);
    const configured = validTargetIds.includes(target.id);
    return {
      value: target.id,
      label: `${configured ? "◼" : "◻"} ${target.label}`,
      hint: configured
        ? t("forward.configuredHint", { value: currentValue })
        : currentValue
          ? t("forward.invalidHint", { value: currentValue })
          : t("forward.emptyHint"),
    };
  });
  options.push({
    value: doneValue,
    label: t("forward.doneLabel"),
    hint: t("forward.doneHint", { count: validTargetIds.length }),
  });
  return options;
}

async function promptTargetAction(
  t: Translator,
  target: SupportedForwardPlugin,
  configured: boolean,
): Promise<"edit" | "clear" | "back"> {
  const guardCancel = makeGuardCancel(t);
  await note(
    configured ? t("pageControls.configured") : t("pageControls.unconfigured"),
    t("pageControls.title"),
  );

  if (!configured) return "edit";

  return guardCancel(
    await select<"edit" | "clear" | "back">({
      message: t("action.message", { label: target.label }),
      options: [
        { value: "edit", label: t("action.edit"), hint: t("action.editHint") },
        { value: "clear", label: t("action.clear"), hint: t("action.clearHint") },
        { value: "back", label: t("action.back"), hint: t("action.backHint") },
      ],
      initialValue: "edit",
    }),
  );
}

async function configureFeishuTarget(
  t: Translator,
  target: SupportedForwardPlugin,
  existingAllowFrom: string[],
  draftValues: DraftMap,
): Promise<string | null> {
  if (existingAllowFrom.length > 0) {
    await note(
      t("feishu.allowFromDetected", { values: existingAllowFrom.join(", ") }),
      t("feishu.allowFromTitle"),
    );
  }

  return promptTextOrBack(t("feishu.toMessage"), {
    placeholder: target.placeholder || "ou_xxx",
    defaultValue: draftValues[target.id] || undefined,
    validate: (input) =>
      isValidFeishuTo(input, existingAllowFrom) ? undefined : t("feishu.invalidAllowFrom"),
  });
}

async function configureWeixinTarget(
  t: Translator,
  target: SupportedForwardPlugin,
  draftValues: DraftMap,
  draftAccountIds: DraftMap,
): Promise<{ accountId: string; to: string } | null> {
  await note(t("weixin.targetHelp"), t("weixin.targetHelpTitle"));

  const accountIds = getWeixinAccountIds();
  if (accountIds.length > 0) {
    await note(
      t("weixin.accountsDetected", { values: accountIds.join(", ") }),
      t("weixin.accountsTitle"),
    );
  }

  const accountId = await promptTextOrBack(t("weixin.accountIdMessage"), {
    placeholder: accountIds[0] || "weixin-account-id",
    defaultValue: draftAccountIds[target.id] || accountIds[0] || undefined,
    validate: (input) => (input.trim() ? undefined : t("field.required")),
  });
  if (accountId === null) return null;

  const userIds = getWeixinContextUserIds(accountId);
  if (userIds.length > 0) {
    await note(t("weixin.usersDetected", { values: userIds.join(", ") }), t("weixin.usersTitle"));
  }

  const to = await promptTextOrBack(t("weixin.toMessage"), {
    placeholder: userIds[0] || target.placeholder || "weixin_user_id",
    defaultValue: draftValues[target.id] || userIds[0] || undefined,
    validate: (input) => (input.trim() ? undefined : t("field.required")),
  });
  if (to === null) return null;

  return { accountId, to };
}

async function configureQQBotTarget(
  t: Translator,
  target: SupportedForwardPlugin,
  draftValues: DraftMap,
  draftAccountIds: DraftMap,
): Promise<{ accountId: string; to: string } | null> {
  await note(t("qqbot.targetHelp"), t("qqbot.targetHelpTitle"));

  const knownTargets = getQQBotKnownTargets();
  const accountIds = [...new Set(knownTargets.map((entry) => entry.accountId).filter(Boolean))];
  const defaultAccountId =
    draftAccountIds[target.id] || accountIds[0] || defaultForwardAccountId(target) || undefined;

  if (knownTargets.length > 0) {
    await note(
      t("qqbot.targetsDetected", {
        values: knownTargets
          .map((entry) =>
            [entry.accountId ? `accountId=${entry.accountId}` : "", `to=${entry.to}`]
              .filter(Boolean)
              .join(" "),
          )
          .join(", "),
      }),
      t("qqbot.targetsTitle"),
    );
  }

  const accountId = await promptTextOrBack(t("qqbot.accountIdMessage"), {
    placeholder: defaultAccountId || "default",
    defaultValue: defaultAccountId,
  });
  if (accountId === null) return null;

  const matchedTargets = knownTargets.filter(
    (entry) => !accountId || entry.accountId === accountId,
  );
  const defaultTo =
    draftValues[target.id] || matchedTargets[0]?.to || knownTargets[0]?.to || undefined;
  const to = await promptTextOrBack(t("qqbot.toMessage"), {
    placeholder: defaultTo || target.placeholder || "qqbot:c2c:<user_openid>",
    defaultValue: defaultTo,
    validate: (input) => (input.trim() ? undefined : t("field.required")),
  });
  if (to === null) return null;

  return { accountId, to };
}

async function configureDiscordTarget(
  t: Translator,
  target: SupportedForwardPlugin,
  draftValues: DraftMap,
  draftAccountIds: DraftMap,
): Promise<{ accountId: string; to: string } | null> {
  const knownTargets = getDiscordKnownTargets();
  const accountIds = [...new Set(knownTargets.map((entry) => entry.accountId).filter(Boolean))];
  const defaultAccountId =
    draftAccountIds[target.id] || accountIds[0] || defaultForwardAccountId(target) || undefined;

  if (knownTargets.length > 0) {
    await note(
      t("discord.targetsDetected", {
        values: knownTargets
          .map((entry) =>
            [
              entry.accountId ? `accountId=${entry.accountId}` : "",
              `to=${entry.to}`,
              entry.label ? `(${entry.label})` : "",
            ]
              .filter(Boolean)
              .join(" "),
          )
          .join("\n"),
      }),
      t("discord.targetsTitle"),
    );
  }

  const accountId = await promptTextOrBack(t("discord.accountIdMessage"), {
    placeholder: defaultAccountId || "default",
    defaultValue: defaultAccountId,
  });
  if (accountId === null) return null;

  const matchedTargets = knownTargets.filter(
    (entry) => !accountId || entry.accountId === accountId,
  );
  const defaultTo =
    draftValues[target.id] || matchedTargets[0]?.to || knownTargets[0]?.to || undefined;
  const to = await promptTextOrBack(t("discord.toMessage"), {
    placeholder: defaultTo || target.placeholder || "channel_id or user_id",
    defaultValue: defaultTo,
    validate: (input) => (input.trim() ? undefined : t("field.required")),
  });
  if (to === null) return null;

  return { accountId, to };
}

async function configureTelegramTarget(
  t: Translator,
  target: SupportedForwardPlugin,
  draftValues: DraftMap,
  draftAccountIds: DraftMap,
): Promise<{ accountId: string; to: string } | null> {
  const knownTargets = getTelegramKnownTargets();
  const accountIds = [...new Set(knownTargets.map((entry) => entry.accountId).filter(Boolean))];
  const defaultAccountId =
    draftAccountIds[target.id] || accountIds[0] || defaultForwardAccountId(target) || undefined;

  if (knownTargets.length > 0) {
    await note(
      t("telegram.targetsDetected", {
        values: knownTargets
          .map((entry) =>
            [
              entry.accountId ? `accountId=${entry.accountId}` : "",
              `to=${entry.to}`,
              entry.label ? `(${entry.label})` : "",
            ]
              .filter(Boolean)
              .join(" "),
          )
          .join("\n"),
      }),
      t("telegram.targetsTitle"),
    );
  }

  const accountId = await promptTextOrBack(t("telegram.accountIdMessage"), {
    placeholder: defaultAccountId || "default",
    defaultValue: defaultAccountId,
  });
  if (accountId === null) return null;

  const matchedTargets = knownTargets.filter(
    (entry) => !accountId || entry.accountId === accountId,
  );
  const defaultTo =
    draftValues[target.id] || matchedTargets[0]?.to || knownTargets[0]?.to || undefined;
  const to = await promptTextOrBack(t("telegram.toMessage"), {
    placeholder: defaultTo || target.placeholder || "telegram:<chat_id>",
    defaultValue: defaultTo,
    validate: (input) => (input.trim() ? undefined : t("field.required")),
  });
  if (to === null) return null;

  return { accountId, to };
}

async function configureWhatsappTarget(
  t: Translator,
  target: SupportedForwardPlugin,
  draftValues: DraftMap,
  draftAccountIds: DraftMap,
): Promise<{ accountId: string; to: string } | null> {
  const knownTargets = getWhatsappKnownTargets();
  const accountIds = [...new Set(knownTargets.map((entry) => entry.accountId).filter(Boolean))];
  const defaultAccountId =
    draftAccountIds[target.id] || accountIds[0] || defaultForwardAccountId(target) || undefined;

  if (knownTargets.length > 0) {
    await note(
      t("whatsapp.targetsDetected", {
        values: knownTargets
          .map((entry) =>
            [
              entry.accountId ? `accountId=${entry.accountId}` : "",
              `to=${entry.to}`,
              entry.label ? `(${entry.label})` : "",
            ]
              .filter(Boolean)
              .join(" "),
          )
          .join("\n"),
      }),
      t("whatsapp.targetsTitle"),
    );
  }

  const accountId = await promptTextOrBack(t("whatsapp.accountIdMessage"), {
    placeholder: defaultAccountId || "default",
    defaultValue: defaultAccountId,
  });
  if (accountId === null) return null;

  const matchedTargets = knownTargets.filter(
    (entry) => !accountId || entry.accountId === accountId,
  );
  const defaultTo =
    draftValues[target.id] || matchedTargets[0]?.to || knownTargets[0]?.to || undefined;
  const to = await promptTextOrBack(t("whatsapp.toMessage"), {
    placeholder: defaultTo || target.placeholder || "+<country_code><phone>",
    defaultValue: defaultTo,
    validate: (input) => (input.trim() ? undefined : t("field.required")),
  });
  if (to === null) return null;

  return { accountId, to };
}

async function configureGenericTarget(
  t: Translator,
  target: SupportedForwardPlugin,
  draftValues: DraftMap,
  draftAccountIds: DraftMap,
): Promise<{ accountId: string; to: string } | null> {
  const accountId = await promptTextOrBack(t("generic.accountIdMessage", { label: target.label }), {
    placeholder: defaultForwardAccountId(target) || "default",
    defaultValue: draftAccountIds[target.id] || defaultForwardAccountId(target) || undefined,
  });
  if (accountId === null) return null;

  const to = await promptTextOrBack(t("generic.toMessage", { label: target.label }), {
    placeholder: target.placeholder || `${target.channel}-target-id`,
    defaultValue: draftValues[target.id] || undefined,
    validate: (input) => (input.trim() ? undefined : t("field.required")),
  });
  if (to === null) return null;

  return { accountId, to };
}
