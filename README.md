# @looki-ai/openclaw-looki

An OpenClaw channel plugin for Looki, with a built-in `looki-memory` skill.

## Features

- Long-polls Looki's `/getupdates` and delivers events to your OpenClaw agent
- Optionally forwards the agent's output in parallel to WhatsApp / Telegram /
  Discord / Lark / WeChat / QQ Bot (each target is isolated — one failure
  does not block the others)
- Ships two tools + matching skills so the agent can read Looki directly:
  - `looki_memory` / `looki-memory` — profile, calendar, day timeline,
    moment detail & files, semantic search, For You highlights, latest
    realtime event
  - `looki_task` / `looki-task` — list Looki tasks and toggle per-task
    openclaw message-channel forwarding

## Install

**Recommended:**

```bash
npx -y @looki-ai/openclaw-looki-cli@latest install
```

**Manually:**

```bash
openclaw plugins install @looki-ai/openclaw-looki
```

Then add the [configuration](#configuration) to `~/.openclaw/openclaw.json`
and run `openclaw gateway restart`.

## Configuration

Add this to `~/.openclaw/openclaw.json`:

```json
{
  "channels": {
    "openclaw-looki": {
      "enabled": true,
      "baseUrl": "https://open.looki.ai",
      "apiKey": "lk-xxxxxxxx...",
      "pollTimeoutMs": 30000,
      "maxEvents": 10,
      "forwardTo": [
        { "channel": "telegram", "accountId": "default", "to": "123456789",        "sessionKey": "agent:main:telegram:direct:123456789" },
        { "channel": "discord",  "accountId": "default", "to": "987654321",        "sessionKey": "agent:main:discord:group:987654321" },
        { "channel": "feishu",   "accountId": "default", "to": "user:ou_xxx",      "sessionKey": "agent:main:feishu:direct:ou_xxx" },
        { "channel": "feishu",   "accountId": "default", "to": "chat:oc_xxx",      "sessionKey": "agent:main:feishu:group:oc_xxx" },
        { "channel": "qqbot",    "accountId": "default", "to": "qqbot:c2c:abc123", "sessionKey": "agent:main:qqbot:direct:abc123" }
      ]
    }
  }
}
```

Fields:

| Field           | Required | Default                 | Notes                                                                  |
| --------------- | -------- | ----------------------- | ---------------------------------------------------------------------- |
| `enabled`       | no       | `true`                  | Whether the plugin is enabled                                          |
| `baseUrl`       | yes      | `https://open.looki.ai` |                                                                        |
| `apiKey`        | yes      | —                       | Looki user API key (`lk-...`).                                         |
| `accountId`     | no       | `"default"`             | Identifier for the OpenClaw session/conversation                       |
| `pollTimeoutMs` | no       | `30000`                 | Long-poll timeout (ms). Server caps at 30s                             |
| `maxEvents`     | no       | `10`                    | Max events pulled per poll, 1–100                                      |
| `forwardTo`     | no       | —                       | Array of `{channel, accountId?, to, sessionKey}` for fan-out of the agent's reply  |

> Structural config errors (unknown fields, wrong types, out-of-range values)
> cause the channel to **throw on startup** instead of silently falling back,
> so typos surface early.

## Forwarding (`forwardTo`)

`forwardTo` goes through OpenClaw's runtime outbound delivery, so each target
channel's plugin has to be **installed, configured, and the gateway
restarted** first. Setup writes `sessionKey`; every target must point at an
existing OpenClaw session.

> **`to` is the downstream plugin's outbound address — always copy
> `origin.to` verbatim from the matching session** (in OpenClaw's WebUI
> Sessions tab, or `~/.openclaw/agents/main/sessions/sessions.json`). The
> prefix is **not** optional, and passing a bare id will fail at the
> downstream plugin. `to` and `sessionKey` must come from the same session.

| channel           | Plugin                            | `to` format (matches `origin.to`)                              |
| ----------------- | --------------------------------- | -------------------------------------------------------------- |
| `whatsapp`        | `@openclaw/whatsapp`              | WhatsApp JID (e.g. `15551234567@s.whatsapp.net`)               |
| `telegram`        | `@openclaw/telegram`              | Telegram chat id (numeric, topic per Telegram plugin format)   |
| `discord`         | `@openclaw/discord`               | Discord channel / DM / thread id (numeric)                     |
| `feishu`          | `@larksuite/openclaw-lark`        | `user:<open_id>` for DMs · `chat:<chat_id>` / `channel:<chat_id>` for groups |
| `openclaw-weixin` | `@tencent-weixin/openclaw-weixin` | WeChat user id — recipient must have messaged the bot first    |
| `qqbot`           | `@openclaw/qqbot`                 | `qqbot:c2c:<openid>` / `qqbot:group:<groupid>`                 |

Common installs:

```bash
openclaw plugins install @openclaw/whatsapp
openclaw plugins install @openclaw/telegram
openclaw plugins install @openclaw/discord
openclaw plugins install @larksuite/openclaw-lark
openclaw plugins install @tencent-weixin/openclaw-weixin
openclaw plugins install @openclaw/qqbot
```

Notes:

- Every downstream plugin must be configured in advance, and the downstream
  app must send a message to OpenClaw at least once before the installer can
  discover candidate targets

- Provide `accountId` if the downstream plugin has multiple accounts, else
  OpenClaw falls back to `default`
- `to` must be a real channel-side id, not a display name
- Each target is `try/catch` isolated; one failing downstream will not block
  others
- Only the agent's `final` reply is forwarded — streaming block fragments
  are dropped

## Bundled tools & skills

Installing the plugin automatically registers two tools and their matching
skills. Both reuse `channels.openclaw-looki.baseUrl` / `apiKey`, so **no
separate credentials are needed**. Every fetch has a 30s timeout, and
responses are safe-stringified and truncated to 200 KB before being handed
to the agent, to keep its context sane.

### `looki_memory` / skill `looki-memory`

Read Looki memory (profile, calendar, day timeline, moments, semantic
search, For You highlights, realtime events):

```
looki_memory(action="me")
looki_memory(action="calendar", start_date="2026-04-01", end_date="2026-04-30")
looki_memory(action="day", on_date="2026-04-29")
looki_memory(action="moment", moment_id="mmt_xxx")
looki_memory(action="moment_files", moment_id="mmt_xxx", highlight=true, limit=20)
looki_memory(action="search", query="met Alice", page=1, page_size=20)
looki_memory(action="for_you", group="vlog", liked=true, limit=20)
looki_memory(action="realtime_latest")
```

Full parameter shape:
[`src/tools/memory-tool.ts`](./packages/plugin/src/tools/memory-tool.ts)
(`LOOKI_MEMORY_TOOL_PARAMETERS`).

### `looki_task` / skill `looki-task`

List the user's Looki tasks and toggle whether a given task's output is
forwarded through the openclaw message channel:

```
looki_task(action="tasks")
looki_task(action="tasks", status=2, limit=20)                    # in-progress only
looki_task(action="task_notification", task_id="tsk_xxx", enabled=true)
looki_task(action="task_notification", task_id="tsk_xxx", enabled=false)
```

`status` is `1=NOT_START`, `2=IN_PROGRESS`, `3=DONE`. Full parameter shape:
[`src/tools/task-tool.ts`](./packages/plugin/src/tools/task-tool.ts)
(`LOOKI_TASK_TOOL_PARAMETERS`).
