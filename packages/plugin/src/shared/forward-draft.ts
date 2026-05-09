import { CHANNEL_ID } from "./constants.js";
import type { OpenClawConfigShape } from "./config.js";
import { type SupportedForwardPlugin, defaultForwardAccountId } from "./forward-plugins.js";
import type { LookiForwardPeerKind } from "../forwarding/types.js";

export type ForwardDraftMap = Record<string, string>;
export type ForwardPeerKindDraftMap = Record<string, LookiForwardPeerKind | undefined>;

export type ForwardDraftTarget = {
  channel: string;
  accountId?: string;
  to: string;
  sessionKey: string;
  peerKind: LookiForwardPeerKind;
  agentId?: string;
};

type ExistingForwardEntry = {
  channel?: string;
  accountId?: string;
  to?: string;
  sessionKey?: unknown;
  peerKind?: unknown;
  agentId?: unknown;
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

export function buildInitialDraftPeerKinds(
  cfg: OpenClawConfigShape,
  availableTargets: readonly SupportedForwardPlugin[],
): ForwardPeerKindDraftMap {
  return matchExistingByChannel(cfg, availableTargets, (matched) => {
    const raw = matched?.peerKind;
    return raw === "direct" || raw === "group" ? raw : undefined;
  });
}

export function buildInitialDraftAgentIds(
  cfg: OpenClawConfigShape,
  availableTargets: readonly SupportedForwardPlugin[],
): ForwardDraftMap {
  return matchExistingByChannel(cfg, availableTargets, (matched) => {
    const raw = matched?.agentId;
    return typeof raw === "string" ? raw : "";
  });
}

/** A target is valid once it has `to`, `sessionKey`, and `peerKind` in the draft. */
export function isForwardTargetDraftValid(
  target: SupportedForwardPlugin,
  draftValues: ForwardDraftMap,
  draftSessionKeys: ForwardDraftMap,
  draftPeerKinds: ForwardPeerKindDraftMap,
): boolean {
  return Boolean(
    draftValues[target.id] && draftSessionKeys[target.id] && draftPeerKinds[target.id],
  );
}

export function computeInitialValidTargetIds(
  availableTargets: readonly SupportedForwardPlugin[],
  draftValues: ForwardDraftMap,
  draftSessionKeys: ForwardDraftMap,
  draftPeerKinds: ForwardPeerKindDraftMap,
): string[] {
  return availableTargets
    .filter((target) =>
      isForwardTargetDraftValid(target, draftValues, draftSessionKeys, draftPeerKinds),
    )
    .map((target) => target.id);
}

export function buildForwardTargetsFromDraft(
  availableTargets: readonly SupportedForwardPlugin[],
  validTargetIds: readonly string[],
  draftValues: ForwardDraftMap,
  draftAccountIds: ForwardDraftMap,
  draftSessionKeys: ForwardDraftMap,
  draftPeerKinds: ForwardPeerKindDraftMap,
  draftAgentIds: ForwardDraftMap = {},
): ForwardDraftTarget[] {
  const validSet = new Set(validTargetIds);
  const targets: ForwardDraftTarget[] = [];
  for (const target of availableTargets) {
    if (!validSet.has(target.id)) continue;
    const sessionKey = draftSessionKeys[target.id];
    const peerKind = draftPeerKinds[target.id];
    if (!sessionKey || !peerKind) continue;
    const accountId = draftAccountIds[target.id] || defaultForwardAccountId(target);
    const agentId = draftAgentIds[target.id];
    targets.push({
      channel: target.channel,
      ...(accountId ? { accountId } : {}),
      to: draftValues[target.id],
      sessionKey,
      peerKind,
      ...(agentId ? { agentId } : {}),
    });
  }
  return targets;
}
