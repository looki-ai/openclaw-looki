import type { OpenClawConfig } from "openclaw/plugin-sdk/core";

import {
  formatToolResult,
  lookiApiGet,
  optionalBooleanParam,
  optionalIntegerParam,
  optionalStringParam,
  requireStringParam,
  type JsonRecord,
  type ToolLogger,
} from "../shared/looki-api.js";

type LookiMemoryAction =
  | "me"
  | "calendar"
  | "day"
  | "moment"
  | "moment_files"
  | "search"
  | "for_you"
  | "realtime_latest";

async function executeLookiMemoryAction(
  cfg: OpenClawConfig,
  action: LookiMemoryAction,
  params: JsonRecord,
): Promise<{ content: Array<{ type: "text"; text: string }>; details: JsonRecord }> {
  switch (action) {
    case "me":
      return formatToolResult(action, await lookiApiGet(cfg, "me", {}));
    case "calendar":
      return formatToolResult(
        action,
        await lookiApiGet(cfg, "moments/calendar", {
          start_date: requireStringParam(params, "start_date"),
          end_date: requireStringParam(params, "end_date"),
        }),
      );
    case "day":
      return formatToolResult(
        action,
        await lookiApiGet(cfg, "moments", {
          on_date: requireStringParam(params, "on_date"),
        }),
      );
    case "moment":
      return formatToolResult(
        action,
        await lookiApiGet(
          cfg,
          `moments/${encodeURIComponent(requireStringParam(params, "moment_id"))}`,
          {},
        ),
      );
    case "moment_files":
      return formatToolResult(
        action,
        await lookiApiGet(
          cfg,
          `moments/${encodeURIComponent(requireStringParam(params, "moment_id"))}/files`,
          {
            highlight: optionalBooleanParam(params, "highlight"),
            cursor_id: optionalStringParam(params, "cursor_id"),
            limit: optionalIntegerParam(params, "limit", { min: 1, max: 100 }),
          },
        ),
      );
    case "search":
      return formatToolResult(
        action,
        await lookiApiGet(cfg, "moments/search", {
          query: requireStringParam(params, "query"),
          start_date: optionalStringParam(params, "start_date"),
          end_date: optionalStringParam(params, "end_date"),
          page: optionalIntegerParam(params, "page", { min: 1 }),
          page_size: optionalIntegerParam(params, "page_size", { min: 1, max: 100 }),
        }),
      );
    case "for_you":
      return formatToolResult(
        action,
        await lookiApiGet(cfg, "for_you/items", {
          group: optionalStringParam(params, "group"),
          liked: optionalBooleanParam(params, "liked"),
          recorded_from: optionalStringParam(params, "recorded_from"),
          recorded_to: optionalStringParam(params, "recorded_to"),
          created_from: optionalStringParam(params, "created_from"),
          created_to: optionalStringParam(params, "created_to"),
          cursor_id: optionalStringParam(params, "cursor_id"),
          limit: optionalIntegerParam(params, "limit", { min: 1, max: 100 }),
          order_by: optionalStringParam(params, "order_by"),
        }),
      );
    case "realtime_latest":
      return formatToolResult(
        action,
        await lookiApiGet(cfg, "realtime/latest-event", {}),
      );
    default:
      throw new Error(`Unsupported looki_memory action: ${action satisfies never}`);
  }
}

const LOOKI_MEMORY_TOOL_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  properties: {
    action: {
      type: "string",
      enum: [
        "me",
        "calendar",
        "day",
        "moment",
        "moment_files",
        "search",
        "for_you",
        "realtime_latest",
      ],
      description: "Which Looki memory endpoint to query.",
    },
    start_date: { type: "string", description: "YYYY-MM-DD start date." },
    end_date: { type: "string", description: "YYYY-MM-DD end date." },
    on_date: { type: "string", description: "YYYY-MM-DD date for a single day lookup." },
    moment_id: { type: "string", description: "Looki moment ID." },
    query: { type: "string", description: "Natural-language memory search query." },
    highlight: { type: "boolean", description: "Filter moment files to highlights only." },
    cursor_id: { type: "string", description: "Pagination cursor." },
    limit: { type: "integer", description: "Page size (usually max 100)." },
    page: { type: "integer", description: "1-based page number for search." },
    page_size: { type: "integer", description: "Search page size (max 100)." },
    group: {
      type: "string",
      description: "Highlight group for for_you: all, comic, vlog, present, other.",
    },
    liked: { type: "boolean", description: "Filter highlights by liked status." },
    recorded_from: { type: "string", description: "YYYY-MM-DD lower bound for recorded date." },
    recorded_to: { type: "string", description: "YYYY-MM-DD upper bound for recorded date." },
    created_from: { type: "string", description: "YYYY-MM-DD lower bound for created date." },
    created_to: { type: "string", description: "YYYY-MM-DD upper bound for created date." },
    order_by: {
      type: "string",
      description: "for_you sort field: created_at or recorded_at.",
    },
  },
  required: ["action"],
} as const;

function makeLookiMemoryExecute(getConfig: () => OpenClawConfig, logger?: ToolLogger) {
  return async (_id: string, rawParams: Record<string, unknown>) => {
    const action = requireStringParam(rawParams, "action") as LookiMemoryAction;
    logger?.info?.(`[openclaw-looki] looki_memory action=${action}`);
    return executeLookiMemoryAction(getConfig(), action, rawParams);
  };
}

export const LOOKI_MEMORY_TOOL = {
  name: "looki_memory",
  label: "Looki Memory",
  description:
    "Read Looki memory data using the configured channels.openclaw-looki baseUrl/apiKey. Supports profile, calendar, day timeline, moment detail, moment files, search, highlights, and the latest realtime event (beta).",
  parameters: LOOKI_MEMORY_TOOL_PARAMETERS,
  makeExecute: makeLookiMemoryExecute,
} as const;
