---
name: looki-memory
description: Access the user's Looki personal memory through the openclaw-looki plugin tool for profile, memories, search, and highlights.
metadata:
  {
    "openclaw":
      {
        "requires":
          { "config": ["channels.openclaw-looki.baseUrl", "channels.openclaw-looki.apiKey"] },
      },
  }
---

# Looki Memory

Use the `looki_memory` tool whenever the user wants information from their Looki memory.

## Important

- Do **not** ask the user for `base_url` or `api_key` if the `openclaw-looki` channel is already configured.
- The `looki_memory` tool automatically reads credentials from `channels.openclaw-looki.baseUrl` and `channels.openclaw-looki.apiKey`.
- Never ask the user to paste the Looki API key into chat unless they are explicitly trying to configure the plugin.
- If the tool reports missing configuration, tell the user to configure the `openclaw-looki` channel first.

## Use this skill when

- The user asks what happened on a date or across a date range
- The user asks about a specific Looki moment
- The user wants photos/videos from a moment
- The user wants to search memories by topic
- The user wants AI-generated highlights or recaps
- The user asks profile questions based on their Looki account

## Tool mapping

### 1. Profile / account

Use:

```json
{
  "action": "me"
}
```

### 2. Calendar view for a range

Use:

```json
{
  "action": "calendar",
  "start_date": "2026-01-01",
  "end_date": "2026-01-31"
}
```

### 3. Everything captured on a specific day

Use:

```json
{
  "action": "day",
  "on_date": "2026-01-15"
}
```

### 4. Recall one moment

Use:

```json
{
  "action": "moment",
  "moment_id": "moment-uuid"
}
```

### 5. Photos/videos from a moment

Use:

```json
{
  "action": "moment_files",
  "moment_id": "moment-uuid",
  "limit": 20
}
```

Optional:

- `highlight`: `true` / `false`
- `cursor_id`: pagination cursor

### 6. Search memories by topic

Use:

```json
{
  "action": "search",
  "query": "coffee with Sarah",
  "page_size": 10
}
```

Optional:

- `start_date`
- `end_date`
- `page`
- `page_size`

### 7. Highlights / For You

Use:

```json
{
  "action": "for_you",
  "group": "comic",
  "limit": 20
}
```

Optional:

- `liked`
- `recorded_from`
- `recorded_to`
- `created_from`
- `created_to`
- `cursor_id`
- `order_by`

## Behavior

- Prefer the narrowest query that answers the user’s question.
- If the user gives a fuzzy request, first use `search` or `calendar`, then drill into `moment`.
- When listing memories, summarize the relevant results instead of dumping raw JSON unless the user asks for exact data.
- If the user asks for media from a moment, use `moment_files`.
- If a date is ambiguous, ask a clarifying question before calling the tool.
