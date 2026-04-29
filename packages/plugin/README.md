# @looki-ai/openclaw-looki

An OpenClaw channel plugin for Looki, with a built-in `looki-memory` skill.

## Features

- Long-polls Looki's `/getupdates` and delivers events to your OpenClaw agent
- Optionally forwards the agent's output in parallel to Feishu / WeChat /
  QQ Bot / WhatsApp / Telegram / Discord (each target is isolated — one
  failure does not block the others)
- Ships a `looki_memory` tool and matching skill so the agent can read Looki
  memory directly (profile, calendar, day timeline, moment detail & files,
  semantic search, For You highlights)

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

## Environments

| Environment | baseUrl                   |
| ----------- | ------------------------- |
| Global      | `https://open.looki.ai`   |
| China       | `https://open.looki.tech` |
| Custom      | Custom URL                |

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
        { "channel": "feishu",          "accountId": "default",           "to": "ou_xxx" },
        { "channel": "telegram",        "accountId": "default",           "to": "123456789" },
        { "channel": "openclaw-weixin", "accountId": "weixin-account-id", "to": "weixin_user_id" }
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
| `forwardTo`     | no       | —                       | Array of `{channel, accountId?, to}` for fan-out of the agent's reply  |

> Structural config errors (unknown fields, wrong types, out-of-range values)
> cause the channel to **throw on startup** instead of silently falling back,
> so typos surface early.

## Forwarding (`forwardTo`)

`forwardTo` goes through OpenClaw's runtime outbound adapter, so each target
channel's plugin has to be **installed, configured, and the gateway
restarted** first.

| channel           | Plugin                            | `to` format                                                    |
| ----------------- | --------------------------------- | -------------------------------------------------------------- |
| `feishu`          | `@larksuite/openclaw-lark`        | Feishu open_id / chat_id etc.                                  |
| `openclaw-weixin` | `@tencent-weixin/openclaw-weixin` | WeChat user id — recipient should have messaged the bot first  |
| `qqbot`           | `@openclaw/qqbot`                 | `qqbot:c2c:<openid>` / `qqbot:group:<groupid>`                 |
| `whatsapp`        | `@openclaw/whatsapp`              | WhatsApp JID or phone number                                   |
| `telegram`        | `@openclaw/telegram`              | Telegram chat id (topic per Telegram plugin format)            |
| `discord`         | `@openclaw/discord`               | Discord channel id / DM / thread id                            |

Common installs:

```bash
openclaw plugins install @larksuite/openclaw-lark
openclaw plugins install @tencent-weixin/openclaw-weixin
openclaw plugins install @openclaw/qqbot
openclaw plugins install @openclaw/whatsapp
openclaw plugins install @openclaw/telegram
openclaw plugins install @openclaw/discord
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

## Looki Memory skill / tool

Installing the plugin automatically registers a tool called `looki_memory`
and a skill `looki-memory` that uses it. The agent can call it directly:

```
looki_memory(action="me")
looki_memory(action="calendar", start_date="2026-04-01", end_date="2026-04-30")
looki_memory(action="day", on_date="2026-04-29")
looki_memory(action="moment", moment_id="mmt_xxx")
looki_memory(action="moment_files", moment_id="mmt_xxx", highlight=true, limit=20)
looki_memory(action="search", query="met Alice", page=1, page_size=20)
looki_memory(action="for_you", group="vlog", liked=true, limit=20)
```

Every action reuses `channels.openclaw-looki.baseUrl` / `apiKey`, so **no
separate credentials are needed**. Full parameter shape lives in
[`src/tools/memory-tool.ts`](./src/tools/memory-tool.ts)
(`LOOKI_MEMORY_TOOL_PARAMETERS`).

The fetch has a 30s timeout, and responses are safe-stringified and truncated
to 200 KB before being handed to the agent, to keep its context sane.
