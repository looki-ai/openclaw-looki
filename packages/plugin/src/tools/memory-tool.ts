import type { OpenClawConfig } from "openclaw/plugin-sdk/core";

import { buildLookiUrl } from "../looki/base-url.js";
import { resolveLookiAccount } from "../looki/account.js";

type JsonRecord = Record<string, unknown>;

const LOOKI_MEMORY_FETCH_TIMEOUT_MS = 30_000;
const LOOKI_MEMORY_MAX_TEXT_LENGTH = 200_000;

type LookiMemoryAction =
  | "me"
  | "calendar"
  | "day"
  | "moment"
  | "moment_files"
  | "search"
  | "for_you"
  | "reminders"
  | "reminder_openclaw";

type ToolLogger = {
  info?: (message: string) => void;
  error?: (message: string) => void;
};

function requireStringParam(params: JsonRecord, key: string): string {
  const value = params[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing required parameter: ${key}`);
  }
  return value.trim();
}

function optionalStringParam(params: JsonRecord, key: string): string | undefined {
  const value = params[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function optionalBooleanParam(params: JsonRecord, key: string): boolean | undefined {
  const value = params[key];
  return typeof value === "boolean" ? value : undefined;
}

function optionalIntegerParam(
  params: JsonRecord,
  key: string,
  options?: { min?: number; max?: number },
): number | undefined {
  const value = params[key];
  if (value == null) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`Parameter ${key} must be an integer`);
  }
  if (options?.min != null && value < options.min) {
    throw new Error(`Parameter ${key} must be >= ${options.min}`);
  }
  if (options?.max != null && value > options.max) {
    throw new Error(`Parameter ${key} must be <= ${options.max}`);
  }
  return value;
}

function buildQuery(
  entries: Record<string, string | number | boolean | undefined>,
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(entries)) {
    if (value == null) continue;
    params.set(key, String(value));
  }
  return params;
}

async function lookiMemoryRequest(
  cfg: OpenClawConfig,
  method: "GET" | "POST",
  path: string,
  query: Record<string, string | number | boolean | undefined>,
  body?: JsonRecord,
): Promise<JsonRecord> {
  const account = resolveLookiAccount(cfg);
  if (!account.configured) {
    throw new Error(
      "looki_memory requires channels.openclaw-looki.baseUrl and channels.openclaw-looki.apiKey to be configured",
    );
  }

  const url = buildLookiUrl(account.baseUrl, path, "tool");
  const searchParams = buildQuery(query);
  const rawQuery = searchParams.toString();
  if (rawQuery) {
    url.search = rawQuery;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LOOKI_MEMORY_FETCH_TIMEOUT_MS);
  const headers: Record<string, string> = { "X-API-Key": account.apiKey };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  let res: Response;
  let rawText: string;
  try {
    res = await fetch(url.toString(), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    rawText = await res.text();
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `looki_memory request timed out after ${LOOKI_MEMORY_FETCH_TIMEOUT_MS}ms`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
  let payload: JsonRecord;
  try {
    payload = JSON.parse(rawText) as JsonRecord;
  } catch {
    throw new Error(`looki_memory returned non-JSON response (${res.status})`);
  }

  if (!res.ok) {
    const detail =
      typeof payload.detail === "string" && payload.detail
        ? payload.detail
        : rawText || `HTTP ${res.status}`;
    throw new Error(`looki_memory request failed: ${detail}`);
  }

  if (typeof payload.code === "number" && payload.code !== 0) {
    const detail =
      typeof payload.detail === "string" && payload.detail
        ? payload.detail
        : `code=${String(payload.code)}`;
    throw new Error(`looki_memory API error: ${detail}`);
  }

  return payload;
}

async function lookiMemoryGet(
  cfg: OpenClawConfig,
  path: string,
  query: Record<string, string | number | boolean | undefined>,
): Promise<JsonRecord> {
  return lookiMemoryRequest(cfg, "GET", path, query);
}

async function lookiMemoryPost(
  cfg: OpenClawConfig,
  path: string,
  body: JsonRecord,
): Promise<JsonRecord> {
  return lookiMemoryRequest(cfg, "POST", path, {}, body);
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch (err) {
    return `<looki_memory: failed to serialize response (${String(err)})>`;
  }
}

function truncateForAgent(text: string): string {
  if (text.length <= LOOKI_MEMORY_MAX_TEXT_LENGTH) return text;
  const head = text.slice(0, LOOKI_MEMORY_MAX_TEXT_LENGTH);
  const omitted = text.length - LOOKI_MEMORY_MAX_TEXT_LENGTH;
  return `${head}\n... [truncated ${omitted} chars]`;
}

function formatToolResult(
  action: LookiMemoryAction,
  payload: JsonRecord,
): { content: Array<{ type: "text"; text: string }>; details: JsonRecord } {
  const details = {
    action,
    detail: payload.detail ?? "success",
    data: payload.data ?? null,
  };
  return {
    content: [
      {
        type: "text",
        text: truncateForAgent(safeStringify(details)),
      },
    ],
    details,
  };
}

async function executeLookiMemoryAction(
  cfg: OpenClawConfig,
  action: LookiMemoryAction,
  params: JsonRecord,
): Promise<{ content: Array<{ type: "text"; text: string }>; details: JsonRecord }> {
  switch (action) {
    case "me":
      return formatToolResult(action, await lookiMemoryGet(cfg, "me", {}));
    case "calendar":
      return formatToolResult(
        action,
        await lookiMemoryGet(cfg, "moments/calendar", {
          start_date: requireStringParam(params, "start_date"),
          end_date: requireStringParam(params, "end_date"),
        }),
      );
    case "day":
      return formatToolResult(
        action,
        await lookiMemoryGet(cfg, "moments", {
          on_date: requireStringParam(params, "on_date"),
        }),
      );
    case "moment":
      return formatToolResult(
        action,
        await lookiMemoryGet(
          cfg,
          `moments/${encodeURIComponent(requireStringParam(params, "moment_id"))}`,
          {},
        ),
      );
    case "moment_files":
      return formatToolResult(
        action,
        await lookiMemoryGet(
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
        await lookiMemoryGet(cfg, "moments/search", {
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
        await lookiMemoryGet(cfg, "for_you/items", {
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
    case "reminders":
      return formatToolResult(
        action,
        await lookiMemoryGet(cfg, "reminders", {
          status: optionalIntegerParam(params, "status", { min: 1, max: 3 }),
          cursor_id: optionalStringParam(params, "cursor_id"),
          limit: optionalIntegerParam(params, "limit", { min: 1, max: 100 }),
        }),
      );
    case "reminder_openclaw": {
      const reminderId = requireStringParam(params, "reminder_id");
      const enabled = params.enabled;
      if (typeof enabled !== "boolean") {
        throw new Error("Parameter enabled must be a boolean");
      }
      return formatToolResult(
        action,
        await lookiMemoryPost(
          cfg,
          `reminders/${encodeURIComponent(reminderId)}/openclaw`,
          { enabled },
        ),
      );
    }
    default:
      throw new Error(`Unsupported looki_memory action: ${action satisfies never}`);
  }
}

export const LOOKI_MEMORY_TOOL_NAME = "looki_memory";

export const LOOKI_MEMORY_TOOL_LABEL = "Looki Memory";

export const LOOKI_MEMORY_TOOL_DESCRIPTION =
  "Read and manage Looki memory data using the configured channels.openclaw-looki baseUrl/apiKey. Supports profile, calendar, day timeline, moment detail, moment files, search, highlights, listing the user's reminders, and toggling the openclaw notification switch per reminder.";

export const LOOKI_MEMORY_TOOL_PARAMETERS = {
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
        "reminders",
        "reminder_openclaw",
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
    status: {
      type: "integer",
      description:
        "Reminder status filter for reminders action: 1=NOT_START, 2=IN_PROGRESS, 3=DONE.",
    },
    reminder_id: {
      type: "string",
      description: "Reminder item ID for reminder_openclaw action.",
    },
    enabled: {
      type: "boolean",
      description:
        "For reminder_openclaw: true to enable openclaw notification, false to disable.",
    },
  },
  required: ["action"],
} as const;

/**
 * Produce an execute() bound to a resolved OpenClaw config. Plugin entry passes
 * `api.config` (or the invocation ctx.config) so the static tool shape stays
 * visible to `openclaw plugins inspect` (which doesn't run factory callbacks).
 */
export function makeLookiMemoryExecute(
  getConfig: () => OpenClawConfig,
  logger?: ToolLogger,
) {
  return async (_id: string, rawParams: Record<string, unknown>) => {
    const action = requireStringParam(rawParams, "action") as LookiMemoryAction;
    logger?.info?.(`[openclaw-looki] looki_memory action=${action}`);
    return executeLookiMemoryAction(getConfig(), action, rawParams);
  };
}
