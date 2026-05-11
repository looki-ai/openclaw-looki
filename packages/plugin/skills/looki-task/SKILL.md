---
name: looki-task
description: List the user's Looki tasks and toggle the openclaw message-channel switch per task through the openclaw-looki plugin tool.
metadata:
  {
    "openclaw":
      {
        "requires":
          { "config": ["channels.openclaw-looki.baseUrl", "channels.openclaw-looki.apiKey"] },
      },
  }
---

# Looki Task

Use the `looki_task` tool with the `tasks` / `task_notification` actions whenever the user wants to view their Looki tasks or toggle whether a specific task is forwarded through openclaw.

## Important

- Do **not** ask the user for `base_url` or `api_key` if the `openclaw-looki` channel is already configured.
- The `looki_task` tool automatically reads credentials from `channels.openclaw-looki.baseUrl` and `channels.openclaw-looki.apiKey`.
- Never ask the user to paste the Looki API key into chat unless they are explicitly trying to configure the plugin.
- If the tool reports missing configuration, tell the user to configure the `openclaw-looki` channel first.

## Use this skill when

- The user wants to see their own tasks
- The user asks which tasks still have openclaw message-channel forwarding enabled
- The user wants to enable or disable openclaw message-channel forwarding for a specific task (e.g. "stop pushing this task to openclaw")

## Tool mapping

### 1. List the user's tasks

```json
{
  "action": "tasks",
  "limit": 20
}
```

Optional:

- `status`: `1` (NOT_START), `2` (IN_PROGRESS), or `3` (DONE). Omit to include all statuses.
- `cursor_id`: pagination cursor
- `limit`: page size (max 100)

Each returned item includes `message_channel_enabled`, which reflects whether task notifications for this item are forwarded through openclaw.

### 2. Toggle the openclaw message-channel switch for a task

```json
{
  "action": "task_notification",
  "task_id": "task-uuid",
  "enabled": true
}
```

- `enabled: true` turns openclaw message-channel forwarding on for that task; `false` turns it off.
- If the user only references the task by content, first call `tasks` to resolve the ID before toggling.

## Parameters

```ts
task_id: {
  type: "string",
  description: "Task item ID for task_notification action.",
},
enabled: {
  type: "boolean",
  description:
    "For task_notification: true to enable openclaw message-channel forwarding, false to disable.",
},
```

## Behavior

- When the user references a task by its content rather than ID, call `tasks` first to resolve the matching item before calling `task_notification`.
- When listing tasks, summarize the relevant items (title, status, `message_channel_enabled`) rather than dumping raw JSON unless the user asks for exact data.
- Confirm the result after toggling (e.g. "openclaw message-channel forwarding for '<title>' is now enabled/disabled").
