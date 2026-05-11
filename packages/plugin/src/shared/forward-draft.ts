import { CHANNEL_ID } from "./constants.js";
import type { OpenClawConfigShape } from "./config.js";
import { type SupportedForwardPlugin, defaultForwardAccountId } from "./forward-plugins.js";

export type ForwardDraftMap = Record<string, string>;

export type ForwardDraftTarget = {
  channel: string;
  accountId?: string;
  to: string;
  sessionKey: string;
};

type ExistingForwardEntry = {
  channel?: string;
  accountId?: string;
  to?: string;
  sessionKey?: unknown;
};

function readExistingForwardTargets(cfg: OpenClawConfigShape): ExistingForwardEntry[] {
  const channels = cfg.channels ?? {};
  const section = channels[CHANNEL_ID] as { forwardTo?: unknown } | undefined;
  return Array.isArray(section?.forwardTo)
    ? (section!.forwardTo as ExistingForwardEntry[])
    : [];
}

function matchExistingByChannel<T>(
  cfg: OpenClawConfigShape,
  availableTargets: readonly SupportedForwardPlugin[],
  selector: (matched: ExistingForwardEntry | null, target: SupportedForwardPlugin) => T,
): Record<string, T> {
  const currentTargets = readExistingForwardTargets(cfg);
  const usedIndexes = new Set<number>();

  return Object.fromEntries(
    availableTargets.map((target) => {
      const matchedIndex = currentTargets.findIndex(
        (entry, entryIndex) => !usedIndexes.has(entryIndex) && entry?.channel === target.channel,
      );
      const matched = matchedIndex >= 0 ? currentTargets[matchedIndex] : null;
      if (matchedIndex >= 0) usedIndexes.add(matchedIndex);
      return [target.id, selector(matched, target)];
    }),
  );
}

export function buildInitialDraftValues(
  cfg: OpenClawConfigShape,
  availableTargets: readonly SupportedForwardPlugin[],
): ForwardDraftMap {
  return matchExistingByChannel(cfg, availableTargets, (matched) => matched?.to || "");
}

export function buildInitialDraftAccountIds(
  cfg: OpenClawConfigShape,
  availableTargets: readonly SupportedForwardPlugin[],
): ForwardDraftMap {
  return matchExistingByChannel(
    cfg,
    availableTargets,
    (matched, target) => matched?.accountId || defaultForwardAccountId(target) || "",
  );
}

export function buildInitialDraftSessionKeys(
  cfg: OpenClawConfigShape,
  availableTargets: readonly SupportedForwardPlugin[],
): ForwardDraftMap {
  return matchExistingByChannel(cfg, availableTargets, (matched) => {
    const raw = matched?.sessionKey;
    return typeof raw === "string" ? raw : "";
  });
}

/** A target is valid once it has `to` and `sessionKey` in the draft. */
export function isForwardTargetDraftValid(
  target: SupportedForwardPlugin,
  draftValues: ForwardDraftMap,
  draftSessionKeys: ForwardDraftMap,
): boolean {
  return Boolean(draftValues[target.id] && draftSessionKeys[target.id]);
}

export function computeInitialValidTargetIds(
  availableTargets: readonly SupportedForwardPlugin[],
  draftValues: ForwardDraftMap,
  draftSessionKeys: ForwardDraftMap,
): string[] {
  return availableTargets
    .filter((target) => isForwardTargetDraftValid(target, draftValues, draftSessionKeys))
    .map((target) => target.id);
}

export function buildForwardTargetsFromDraft(
  availableTargets: readonly SupportedForwardPlugin[],
  validTargetIds: readonly string[],
  draftValues: ForwardDraftMap,
  draftAccountIds: ForwardDraftMap,
  draftSessionKeys: ForwardDraftMap,
): ForwardDraftTarget[] {
  const validSet = new Set(validTargetIds);
  const targets: ForwardDraftTarget[] = [];
  for (const target of availableTargets) {
    if (!validSet.has(target.id)) continue;
    const sessionKey = draftSessionKeys[target.id];
    if (!sessionKey) continue;
    const accountId = draftAccountIds[target.id] || defaultForwardAccountId(target);
    targets.push({
      channel: target.channel,
      ...(accountId ? { accountId } : {}),
      to: draftValues[target.id],
      sessionKey,
    });
  }
  return targets;
}
