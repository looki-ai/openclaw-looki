import { note, select } from "@clack/prompts";

import {
  buildForwardTargetsFromDraft,
  buildInitialDraftAccountIds,
  buildInitialDraftPeerKinds,
  buildInitialDraftValues,
  computeInitialValidTargetIds,
  defaultForwardAccountId,
  detectForwardTargets,
  listForwardSessionsForChannel,
  type ForwardDraftMap,
  type ForwardDraftPeerKindMap,
  type ForwardDraftTarget,
  type ForwardSessionCandidate,
  type SupportedForwardPlugin,
} from "@looki-ai/openclaw-looki/shared";

import type { OpenclawConfig } from "./config-io.js";
import type { Translator } from "./i18n.js";
import { makeGuardCancel } from "./ui.js";

type DraftMap = ForwardDraftMap;
type PeerKindMap = ForwardDraftPeerKindMap;
type ForwardTarget = ForwardDraftTarget;

type SessionCache = Map<string, ForwardSessionCandidate[]>;

function getSessions(cache: SessionCache, channel: string): ForwardSessionCandidate[] {
  let cached = cache.get(channel);
  if (!cached) {
    cached = listForwardSessionsForChannel(channel);
    cache.set(channel, cached);
  }
  return cached;
}

function formatSessionHint(entry: ForwardSessionCandidate): string {
  const parts: string[] = [];
  if (entry.peerKind === "group") parts.push("group");
  else parts.push("direct");
  if (entry.accountId && entry.accountId !== "default") parts.push(`@ ${entry.accountId}`);
  if (entry.peerId && entry.peerId !== entry.to) parts.push(entry.peerId);
  return parts.join(" · ");
}

export async function runForwardWizard(
  t: Translator,
  config: OpenclawConfig,
): Promise<ForwardTarget[]> {
  const guardCancel = makeGuardCancel(t);
  const sessionCache: SessionCache = new Map();

  const detected = detectForwardTargets(config);
  if (detected.length === 0) {
    await note(t("plugin.none"), t("plugin.title"));
    return [];
  }

  // Only expose plugins that actually have at least one session to choose from.
  const availableTargets = detected.filter(
    (target) => getSessions(sessionCache, target.channel).length > 0,
  );
  const disabledTargets = detected.filter(
    (target) => getSessions(sessionCache, target.channel).length === 0,
  );

  if (availableTargets.length === 0) {
    await note(
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
  await note([detectedLine, disabledLine].filter(Boolean).join("\n"), t("plugin.title"));

  const draftValues: DraftMap = buildInitialDraftValues(config, availableTargets);
  const draftAccountIds: DraftMap = buildInitialDraftAccountIds(config, availableTargets);
  const draftPeerKinds: PeerKindMap = buildInitialDraftPeerKinds(config, availableTargets);
  const validTargetIds = new Set(computeInitialValidTargetIds(availableTargets, draftValues));

  const doneValue = "__done__";

  const currentHint = (target: SupportedForwardPlugin): string => {
    const to = draftValues[target.id];
    if (!to) return t("forward.emptyHint");
    const accountId = draftAccountIds[target.id] || defaultForwardAccountId(target);
    const peerKind = draftPeerKinds[target.id];
    const bits = [to];
    if (peerKind) bits.push(peerKind);
    if (accountId && accountId !== "default") bits.push(`@ ${accountId}`);
    return t("forward.configuredHint", { value: bits.join(" · ") });
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
      label: t("forward.doneLabel"),
      hint: t("forward.doneHint", { count: validTargetIds.size }),
    });
    return options;
  };

  while (true) {
    await note(t("listControls.body"), t("listControls.title"));
    const firstChoice = validTargetIds.values().next().value;
    const choice = guardCancel(
      await select({
        message: t("forward.targetMessage"),
        options: buildPluginListOptions(),
        initialValue: firstChoice || availableTargets[0]?.id || doneValue,
      }),
    );

    if (choice === doneValue) {
      return buildForwardTargetsFromDraft(
        availableTargets,
        [...validTargetIds],
        draftValues,
        draftAccountIds,
        draftPeerKinds,
      );
    }

    const target = availableTargets.find((item) => item.id === choice);
    if (!target) continue;

    const sessions = getSessions(sessionCache, target.channel);
    const CLEAR_VALUE = "__clear__";
    const BACK_VALUE = "__back__";

    type Option = { value: string; label: string; hint?: string };
    const sessionOptions: Option[] = sessions.map((entry, index) => ({
      value: String(index),
      label: entry.label || entry.peerId || entry.to,
      hint: formatSessionHint(entry),
    }));
    if (validTargetIds.has(target.id)) {
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

    const currentTo = draftValues[target.id];
    const matchedIndex = currentTo
      ? sessions.findIndex((entry) => entry.to === currentTo || entry.peerId === currentTo)
      : -1;

    const sessionChoice = guardCancel(
      await select<string>({
        message: t("session.message", { label: target.label }),
        options: sessionOptions,
        initialValue: matchedIndex >= 0 ? String(matchedIndex) : sessionOptions[0]?.value,
      }),
    );

    if (sessionChoice === BACK_VALUE) continue;
    if (sessionChoice === CLEAR_VALUE) {
      draftValues[target.id] = "";
      draftAccountIds[target.id] = defaultForwardAccountId(target) || "";
      delete draftPeerKinds[target.id];
      validTargetIds.delete(target.id);
      continue;
    }

    const picked = sessions[Number(sessionChoice)];
    if (!picked) continue;
    draftValues[target.id] = picked.to;
    draftAccountIds[target.id] = picked.accountId;
    draftPeerKinds[target.id] = picked.peerKind;
    validTargetIds.add(target.id);
  }
}
