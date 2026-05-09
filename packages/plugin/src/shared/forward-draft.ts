import { CHANNEL_ID } from "./constants.js";
import type { OpenClawConfigShape } from "./config.js";
import { type SupportedForwardPlugin, defaultForwardAccountId } from "./forward-plugins.js";
import { type ForwardPeerKind } from "./discovery.js";

export type ForwardDraftMap = Record<string, string>;

export type ForwardDraftPeerKindMap = Record<string, ForwardPeerKind | undefined>;

export type ForwardDraftTarget = {
  channel: string;
  accountId?: string;
  to: string;
  peerKind?: ForwardPeerKind;
};

type ExistingForwardEntry = {
  channel?: string;
  accountId?: string;
  to?: string;
  peerKind?: unknown;
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

export function buildInitialDraftPeerKinds(
  cfg: OpenClawConfigShape,
  availableTargets: readonly SupportedForwardPlugin[],
): ForwardDraftPeerKindMap {
  return matchExistingByChannel(cfg, availableTargets, (matched) => {
    const raw = matched?.peerKind;
    if (raw === "direct" || raw === "group") return raw;
    return undefined;
  });
}

/** A target is valid once it has a non-empty `to` stored in the draft. */
export function isForwardTargetDraftValid(
  target: SupportedForwardPlugin,
  draftValues: ForwardDraftMap,
): boolean {
  return Boolean(draftValues[target.id]);
}

export function computeInitialValidTargetIds(
  availableTargets: readonly SupportedForwardPlugin[],
  draftValues: ForwardDraftMap,
): string[] {
  return availableTargets
    .filter((target) => isForwardTargetDraftValid(target, draftValues))
    .map((target) => target.id);
}

export function buildForwardTargetsFromDraft(
  availableTargets: readonly SupportedForwardPlugin[],
  validTargetIds: readonly string[],
  draftValues: ForwardDraftMap,
  draftAccountIds: ForwardDraftMap,
  draftPeerKinds: ForwardDraftPeerKindMap = {},
): ForwardDraftTarget[] {
  const validSet = new Set(validTargetIds);
  return availableTargets
    .filter((target) => validSet.has(target.id))
    .map((target) => {
      const accountId = draftAccountIds[target.id] || defaultForwardAccountId(target);
      const peerKind = draftPeerKinds[target.id];
      return {
        channel: target.channel,
        ...(accountId ? { accountId } : {}),
        to: draftValues[target.id],
        ...(peerKind ? { peerKind } : {}),
      };
    });
}
