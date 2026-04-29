import { CHANNEL_ID } from "./constants.js";
import type { OpenClawConfigShape } from "./config.js";
import { type SupportedForwardPlugin, defaultForwardAccountId } from "./forward-plugins.js";
import { getExistingFeishuAllowFrom, isValidFeishuTo } from "./discovery.js";

export type ForwardDraftMap = Record<string, string>;

export type ForwardDraftTarget = {
  channel: string;
  accountId?: string;
  to: string;
};

function readExistingForwardTargets(
  cfg: OpenClawConfigShape,
): Array<{ channel?: string; accountId?: string; to?: string }> {
  const channels = cfg.channels ?? {};
  const section = channels[CHANNEL_ID] as { forwardTo?: unknown } | undefined;
  return Array.isArray(section?.forwardTo)
    ? (section!.forwardTo as Array<{ channel?: string; accountId?: string; to?: string }>)
    : [];
}

function matchExistingByChannel<T>(
  cfg: OpenClawConfigShape,
  availableTargets: readonly SupportedForwardPlugin[],
  selector: (
    matched: { channel?: string; accountId?: string; to?: string } | null,
    target: SupportedForwardPlugin,
  ) => T,
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

export function isForwardTargetDraftValid(
  target: SupportedForwardPlugin,
  draftValues: ForwardDraftMap,
  draftAccountIds: ForwardDraftMap,
  existingAllowFrom: string[],
): boolean {
  const to = draftValues[target.id];
  if (!to) return false;
  if (target.channel === "feishu") return isValidFeishuTo(to, existingAllowFrom);
  if (target.channel === "openclaw-weixin")
    return Boolean(draftAccountIds[target.id] || defaultForwardAccountId(target));
  return true;
}

export function formatDraftHint(
  target: SupportedForwardPlugin,
  draftValues: ForwardDraftMap,
  draftAccountIds: ForwardDraftMap,
): string {
  const to = draftValues[target.id];
  const accountId = draftAccountIds[target.id] || defaultForwardAccountId(target);
  if (!to && !accountId) return "";
  if (target.channel === "openclaw-weixin" || target.channel === "qqbot") {
    return [accountId ? `accountId=${accountId}` : "", to ? `to=${to}` : ""]
      .filter(Boolean)
      .join(" ");
  }
  return to;
}

export function buildForwardTargetsFromDraft(
  availableTargets: readonly SupportedForwardPlugin[],
  validTargetIds: readonly string[],
  draftValues: ForwardDraftMap,
  draftAccountIds: ForwardDraftMap,
): ForwardDraftTarget[] {
  const validSet = new Set(validTargetIds);
  return availableTargets
    .filter((target) => validSet.has(target.id))
    .map((target) => {
      const accountId = draftAccountIds[target.id] || defaultForwardAccountId(target);
      return {
        channel: target.channel,
        ...(accountId ? { accountId } : {}),
        to: draftValues[target.id],
      };
    });
}

export function computeInitialValidTargetIds(
  availableTargets: readonly SupportedForwardPlugin[],
  draftValues: ForwardDraftMap,
  draftAccountIds: ForwardDraftMap,
  existingAllowFrom: string[],
): string[] {
  return availableTargets
    .filter((target) =>
      isForwardTargetDraftValid(target, draftValues, draftAccountIds, existingAllowFrom),
    )
    .map((target) => target.id);
}

export function readFeishuAllowFrom(cfg: OpenClawConfigShape): string[] {
  return getExistingFeishuAllowFrom(cfg);
}
