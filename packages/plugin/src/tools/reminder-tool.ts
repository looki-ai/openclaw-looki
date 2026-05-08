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
} from "../shared/http_util.js";

type LookiReminderAction = "reminders" | "reminder_notification";

async function executeLookiReminderAction(
  cfg: OpenClawConfig,
  action: LookiReminderAction,
  params: JsonRecord,
): Promise<{ content: Array<{ type: "text"; text: string }>; details: JsonRecord }> {
  switch (action) {
    case "reminders":
      return formatToolResult(
        action,
        await lookiApiGet(cfg, "reminders", {
          status: optionalIntegerParam(params, "status", { min: 1, max: 3 }),
          cursor_id: optionalStringParam(params, "cursor_id"),
          limit: optionalIntegerParam(params, "limit", { min: 1, max: 100 }),
        }),
      );
    case "reminder_notification": {
      const reminderId = requireStringParam(params, "reminder_id");
      const enabled = params.enabled;
      if (typeof enabled !== "boolean") {
        throw new Error("Parameter enabled must be a boolean");
      }
      return formatToolResult(
        action,
        await lookiApiPost(
          cfg,
          `reminders/${encodeURIComponent(reminderId)}/message-channel`,
          { enabled },
        ),
      );
    }
    default:
      throw new Error(`Unsupported looki_reminder action: ${action satisfies never}`);
  }
}

export const LOOKI_REMINDER_TOOL_NAME = "looki_reminder";

export const LOOKI_REMINDER_TOOL_LABEL = "Looki Reminder";

export const LOOKI_REMINDER_TOOL_DESCRIPTION =
  "List the user's Looki reminders and toggle the openclaw notification switch per reminder, using the configured channels.openclaw-looki baseUrl/apiKey.";

export const LOOKI_REMINDER_TOOL_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  properties: {
    action: {
      type: "string",
      enum: ["reminders", "reminder_notification"],
      description: "Which Looki reminder endpoint to call.",
    },
    status: {
      type: "integer",
      description:
        "Reminder status filter for reminders action: 1=NOT_START, 2=IN_PROGRESS, 3=DONE.",
    },
    cursor_id: { type: "string", description: "Pagination cursor." },
    limit: { type: "integer", description: "Page size (max 100)." },
    reminder_id: {
      type: "string",
      description: "Reminder item ID for reminder_notification action.",
    },
    enabled: {
      type: "boolean",
      description:
        "For reminder_notification: true to enable openclaw notification, false to disable.",
    },
  },
  required: ["action"],
} as const;

export function makeLookiReminderExecute(
  getConfig: () => OpenClawConfig,
  logger?: ToolLogger,
) {
  return async (_id: string, rawParams: Record<string, unknown>) => {
    const action = requireStringParam(rawParams, "action") as LookiReminderAction;
    logger?.info?.(`[openclaw-looki] looki_reminder action=${action}`);
    return executeLookiReminderAction(getConfig(), action, rawParams);
  };
}
