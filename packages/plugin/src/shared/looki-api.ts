import type { OpenClawConfig } from "openclaw/plugin-sdk/core";

import { buildLookiUrl } from "../looki/base-url.js";
import { resolveLookiAccount } from "../looki/account.js";

export type JsonRecord = Record<string, unknown>;

export type ToolLogger = {
  info?: (message: string) => void;
  error?: (message: string) => void;
};

const LOOKI_API_FETCH_TIMEOUT_MS = 30_000;
const LOOKI_API_MAX_TEXT_LENGTH = 200_000;
const ERROR_BODY_PREVIEW_LENGTH = 200;

export function requireStringParam(params: JsonRecord, key: string): string {
  const value = params[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing required parameter: ${key}`);
  }
  return value.trim();
}

export function optionalStringParam(params: JsonRecord, key: string): string | undefined {
  const value = params[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function optionalBooleanParam(params: JsonRecord, key: string): boolean | undefined {
  const value = params[key];
  return typeof value === "boolean" ? value : undefined;
}

export function optionalIntegerParam(
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

function previewResponseBody(rawText: string): string {
  const compact = rawText.replace(/\s+/g, " ").trim();
  if (!compact) return "<empty body>";
  return compact.length > ERROR_BODY_PREVIEW_LENGTH
    ? `${compact.slice(0, ERROR_BODY_PREVIEW_LENGTH)}...`
    : compact;
}

// These error messages are consumed by the agent (not surfaced to end users
// through i18n), so they are kept in English to stay machine-parseable and
// to keep the prefix stable across locale changes.
function formatHttpFailure(res: Response, detail: string): string {
  if (res.status === 401 || res.status === 403) {
    return `looki tool auth failure (${res.status}): ${detail}`;
  }
  return `looki tool request failed (${res.status}): ${detail}`;
}

async function lookiApiRequest(
  cfg: OpenClawConfig,
  method: "GET" | "POST",
  path: string,
  query: Record<string, string | number | boolean | undefined>,
  body?: JsonRecord,
): Promise<JsonRecord> {
  const account = resolveLookiAccount(cfg);
  if (!account.configured) {
    throw new Error(
      "looki tool requires channels.openclaw-looki.baseUrl and channels.openclaw-looki.apiKey to be configured",
    );
  }

  const url = buildLookiUrl(account.baseUrl, path, "tool");
  const searchParams = buildQuery(query);
  const rawQuery = searchParams.toString();
  if (rawQuery) {
    url.search = rawQuery;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LOOKI_API_FETCH_TIMEOUT_MS);
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
        `looki tool request timed out after ${LOOKI_API_FETCH_TIMEOUT_MS}ms`,
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
    throw new Error(
      `looki tool returned non-JSON response (${res.status}): ${previewResponseBody(rawText)}`,
    );
  }

  if (!res.ok) {
    const detail =
      typeof payload.detail === "string" && payload.detail
        ? payload.detail
        : previewResponseBody(rawText);
    throw new Error(formatHttpFailure(res, detail));
  }

  // Looki tool endpoints currently use `{ code, detail, data }`; endpoints
  // without a numeric `code` are still accepted for forward compatibility.
  if (typeof payload.code === "number" && payload.code !== 0) {
    const detail =
      typeof payload.detail === "string" && payload.detail
        ? payload.detail
        : `code=${String(payload.code)}`;
    throw new Error(`looki tool API error: ${detail}`);
  }

  return payload;
}

export async function lookiApiGet(
  cfg: OpenClawConfig,
  path: string,
  query: Record<string, string | number | boolean | undefined>,
): Promise<JsonRecord> {
  return lookiApiRequest(cfg, "GET", path, query);
}

export async function lookiApiPost(
  cfg: OpenClawConfig,
  path: string,
  body: JsonRecord,
): Promise<JsonRecord> {
  return lookiApiRequest(cfg, "POST", path, {}, body);
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch (err) {
    return `<looki tool: failed to serialize response (${String(err)})>`;
  }
}

function truncateForAgent(text: string): string {
  if (text.length <= LOOKI_API_MAX_TEXT_LENGTH) return text;
  const head = text.slice(0, LOOKI_API_MAX_TEXT_LENGTH);
  const omitted = text.length - LOOKI_API_MAX_TEXT_LENGTH;
  return `${head}\n... [truncated ${omitted} chars]`;
}

export function formatToolResult(
  action: string,
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
