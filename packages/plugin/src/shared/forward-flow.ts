import type { OpenClawConfigShape } from "./config.js";
import {
  buildForwardTargetsFromDrafts,
  buildInitialDrafts,
  defaultForwardAccountId,
  detectForwardTargets,
  listForwardSessionsForChannel,
  type ForwardDrafts,
  type ForwardSessionCandidate,
  type LookiForwardTarget,
  type SupportedForwardPlugin,
} from "./forward-targets.js";

type FlowOption = { value: string; label: string; hint?: string };

export type FlowPrompter = {
  note: (message: string, title?: string) => Promise<void>;
  select: (params: {
    message: string;
    options: Array<FlowOption>;
    initialValue?: string;
  }) => Promise<string>;
};

export type FlowTranslator = (
  key: string,
  params?: Record<string, string | number | boolean | undefined>,
) => string;

function formatSessionHint(entry: ForwardSessionCandidate): string {
  const parts: string[] = [entry.peerKind === "group" ? "group" : "direct"];
  if (entry.accountId && entry.accountId !== "default") parts.push(`@ ${entry.accountId}`);
  if (entry.label && entry.label !== entry.to) parts.push(entry.label);
  return parts.join(" · ");
}

async function safeNote(prompter: FlowPrompter, message: string, title?: string): Promise<void> {
  try {
    await prompter.note(message, title);
  } catch {
    // Notes are explanatory only; a rendering failure should not abort setup.
  }
}

function clearDraftTarget(drafts: ForwardDrafts, target: SupportedForwardPlugin): void {
  drafts.values[target.id] = "";
  drafts.accountIds[target.id] = defaultForwardAccountId(target) || "";
  delete drafts.sessionKeys[target.id];
  drafts.validIds.delete(target.id);
}

export async function runForwardSelectionFlow(deps: {
  cfg: OpenClawConfigShape;
  prompter: FlowPrompter;
  t: FlowTranslator;
}): Promise<LookiForwardTarget[]> {
  const { cfg, prompter, t } = deps;

  const detected = detectForwardTargets(cfg);
  if (detected.length === 0) {
    await safeNote(prompter, t("plugin.none"), t("plugin.title"));
    return [];
  }

  const sessionsByChannel = new Map<string, ForwardSessionCandidate[]>();
  for (const target of detected) {
    try {
      sessionsByChannel.set(target.channel, listForwardSessionsForChannel(target.channel));
    } catch (err) {
      await safeNote(prompter, String(err), t("plugin.title"));
      sessionsByChannel.set(target.channel, []);
    }
  }
  const availableTargets = detected.filter(
    (target) => (sessionsByChannel.get(target.channel) ?? []).length > 0,
  );
  const disabledTargets = detected.filter(
    (target) => (sessionsByChannel.get(target.channel) ?? []).length === 0,
  );

  if (availableTargets.length === 0) {
    await safeNote(
      prompter,
      t("plugin.detectedNoSessions", {
        labels: detected.map((target) => target.label).join(", "),
      }),
      t("plugin.title"),
    );
    return [];
  }

  const detectedLine = t("plugin.detected", {
    labels: availableTargets.map((target) => target.label).join(", "),
  });
  const disabledLine =
    disabledTargets.length > 0
      ? t("plugin.noSessionsSuffix", {
          labels: disabledTargets.map((target) => target.label).join(", "),
        })
      : "";
  await safeNote(
    prompter,
    [detectedLine, disabledLine].filter(Boolean).join("\n"),
    t("plugin.title"),
  );

  const drafts = buildInitialDrafts(cfg, availableTargets);
  const doneValue = "__done__";
  const CLEAR_VALUE = "__clear__";
  const BACK_VALUE = "__back__";

  const currentHint = (target: SupportedForwardPlugin): string => {
    const to = drafts.values[target.id];
    if (!to) return t("forward.emptyHint");
    const accountId = drafts.accountIds[target.id] || defaultForwardAccountId(target);
    const bits = [to];
    if (accountId && accountId !== "default") bits.push(`@ ${accountId}`);
    return t("forward.configuredHint", { value: bits.join(" · ") });
  };

  const buildPluginListOptions = (): FlowOption[] => {
    const options: FlowOption[] = availableTargets.map((target) => ({
      value: target.id,
      label: `${drafts.validIds.has(target.id) ? "◼" : "◻"} ${target.label}`,
      hint: currentHint(target),
    }));
    options.push({
      value: doneValue,
      label: t("forward.doneLabel"),
      hint: t("forward.doneHint", { count: drafts.validIds.size }),
    });
    return options;
  };

  while (true) {
    await safeNote(prompter, t("listControls.body"), t("listControls.title"));
    const firstChoice = drafts.validIds.values().next().value;
    const choice = await prompter.select({
      message: t("forward.targetMessage"),
      options: buildPluginListOptions(),
      initialValue: firstChoice ?? availableTargets[0]?.id ?? doneValue,
    });

    if (choice === doneValue) {
      return buildForwardTargetsFromDrafts(availableTargets, drafts);
    }

    const target = availableTargets.find((item) => item.id === choice);
    if (!target) continue;

    const sessions = sessionsByChannel.get(target.channel) ?? [];
    const sessionOptions: FlowOption[] = sessions.map((entry, index) => ({
      value: String(index),
      label: entry.to,
      hint: formatSessionHint(entry),
    }));
    if (drafts.validIds.has(target.id)) {
      sessionOptions.push({
        value: CLEAR_VALUE,
        label: t("action.clear"),
        hint: t("action.clearHint"),
      });
    }
    sessionOptions.push({
      value: BACK_VALUE,
      label: t("action.back"),
      hint: t("action.backHint"),
    });

    const currentSessionKey = drafts.sessionKeys[target.id];
    const currentTo = drafts.values[target.id];
    const matchedIndex = currentSessionKey
      ? sessions.findIndex((entry) => entry.sessionKey === currentSessionKey)
      : currentTo
        ? sessions.findIndex((entry) => entry.to === currentTo || entry.peerId === currentTo)
        : -1;

    const sessionChoice = await prompter.select({
      message: t("session.message", { label: target.label }),
      options: sessionOptions,
      initialValue: matchedIndex >= 0 ? String(matchedIndex) : sessionOptions[0]?.value,
    });

    if (sessionChoice === BACK_VALUE) continue;
    if (sessionChoice === CLEAR_VALUE) {
      clearDraftTarget(drafts, target);
      continue;
    }

    const picked = sessions[Number(sessionChoice)];
    if (!picked) continue;
    drafts.values[target.id] = picked.to;
    drafts.accountIds[target.id] = picked.accountId;
    drafts.sessionKeys[target.id] = picked.sessionKey;
    drafts.validIds.add(target.id);
  }
}
