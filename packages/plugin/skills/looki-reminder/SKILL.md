---
name: looki-reminder
description: List the user's Looki reminders and toggle the openclaw notification switch per reminder through the openclaw-looki plugin tool.
metadata:
  {
    "openclaw":
      {
        "requires":
          { "config": ["channels.openclaw-looki.baseUrl", "channels.openclaw-looki.apiKey"] },
      },
  }
---

# Looki Reminder

Use the `looki_reminder` tool with the `reminders` / `reminder_notification` actions whenever the user wants to view their Looki reminders or toggle whether a specific reminder is forwarded through openclaw.

## Important

- Do **not** ask the user for `base_url` or `api_key` if the `openclaw-looki` channel is already configured.
- The `looki_reminder` tool automatically reads credentials from `channels.openclaw-looki.baseUrl` and `channels.openclaw-looki.apiKey`.
- Never ask the user to paste the Looki API key into chat unless they are explicitly trying to configure the plugin.
- If the tool reports missing configuration, tell the user to configure the `openclaw-looki` channel first.

## Use this skill when

- The user wants to see their own reminders
- The user asks which reminders still have openclaw notification enabled
- The user wants to enable or disable the openclaw notification for a specific reminder (e.g. "stop pushing this reminder to openclaw")

## Tool mapping

### 1. List the user's reminders

```json
{
  "action": "reminders",
  "limit": 20
}
```

Optional:

- `status`: `1` (NOT_START), `2` (IN_PROGRESS), or `3` (DONE). Omit to include all statuses.
- `cursor_id`: pagination cursor
- `limit`: page size (max 100)

Each returned item includes `openclaw_enabled`, which reflects whether reminder notifications for this item are forwarded through openclaw.

### 2. Toggle the openclaw notification switch for a reminder

```json
{
  "action": "reminder_notification",
  "reminder_id": "reminder-uuid",
  "enabled": true
}
```

- `enabled: true` turns openclaw notification on for that reminder; `false` turns it off.
- If the user only references the reminder by content, first call `reminders` to resolve the ID before toggling.

## Parameters

```ts
reminder_id: {
  type: "string",
  description: "Reminder item ID for reminder_notification action.",
},
enabled: {
  type: "boolean",
  description:
    "For reminder_notification: true to enable openclaw notification, false to disable.",
},
```

## Behavior

- When the user references a reminder by its content rather than ID, call `reminders` first to resolve the matching item before calling `reminder_notification`.
- When listing reminders, summarize the relevant items (title, status, `openclaw_enabled`) rather than dumping raw JSON unless the user asks for exact data.
- Confirm the result after toggling (e.g. "openclaw notification for '<title>' is now enabled/disabled").
