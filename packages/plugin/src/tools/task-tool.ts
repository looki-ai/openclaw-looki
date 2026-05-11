import type { OpenClawConfig } from "openclaw/plugin-sdk/core";

import {
  formatToolResult,
  lookiApiGet,
  lookiApiPost,
  optionalIntegerParam,
  optionalStringParam,
  requireStringParam,
  type JsonRecord,
  type ToolLogger,
} from "../shared/looki-api.js";

type LookiTaskAction = "tasks" | "task_notification";

async function executeLookiTaskAction(
  cfg: OpenClawConfig,
  action: LookiTaskAction,
  params: JsonRecord,
): Promise<{ content: Array<{ type: "text"; text: string }>; details: JsonRecord }> {
  switch (action) {
    case "tasks":
      return formatToolResult(
        action,
        await lookiApiGet(cfg, "tasks", {
          status: optionalIntegerParam(params, "status", { min: 1, max: 3 }),
          cursor_id: optionalStringParam(params, "cursor_id"),
          limit: optionalIntegerParam(params, "limit", { min: 1, max: 100 }),
        }),
      );
    case "task_notification": {
      const taskId = requireStringParam(params, "task_id");
      const enabled = params.enabled;
      if (typeof enabled !== "boolean") {
        throw new Error("Parameter enabled must be a boolean");
      }
      return formatToolResult(
        action,
        await lookiApiPost(cfg, `tasks/${encodeURIComponent(taskId)}/message-channel`, {
          enabled,
        }),
      );
    }
    default:
      throw new Error(`Unsupported looki_task action: ${action satisfies never}`);
  }
}

export const LOOKI_TASK_TOOL_NAME = "looki_task";

export const LOOKI_TASK_TOOL_LABEL = "Looki Task";

export const LOOKI_TASK_TOOL_DESCRIPTION =
  "List the user's Looki tasks and toggle the openclaw message-channel switch per task, using the configured channels.openclaw-looki baseUrl/apiKey.";

export const LOOKI_TASK_TOOL_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  properties: {
    action: {
      type: "string",
      enum: ["tasks", "task_notification"],
      description: "Which Looki task endpoint to call.",
    },
    status: {
      type: "integer",
      description: "Task status filter for tasks action: 1=NOT_START, 2=IN_PROGRESS, 3=DONE.",
    },
    cursor_id: { type: "string", description: "Pagination cursor." },
    limit: { type: "integer", description: "Page size (max 100)." },
    task_id: {
      type: "string",
      description: "Task item ID for task_notification action.",
    },
    enabled: {
      type: "boolean",
      description:
        "For task_notification: true to enable openclaw message-channel forwarding, false to disable.",
    },
  },
  required: ["action"],
} as const;

export function makeLookiTaskExecute(getConfig: () => OpenClawConfig, logger?: ToolLogger) {
  return async (_id: string, rawParams: Record<string, unknown>) => {
    const action = requireStringParam(rawParams, "action") as LookiTaskAction;
    logger?.info?.(`[openclaw-looki] looki_task action=${action}`);
    return executeLookiTaskAction(getConfig(), action, rawParams);
  };
}
