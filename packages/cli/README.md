# @looki-ai/openclaw-looki-cli

Guided installer and re-configurator for the
[openclaw-looki](https://github.com/looki-ai/openclaw-looki) plugin. The goal
is **one command** that installs the plugin, picks the environment, takes
your apiKey, configures downstream IM forwarding, writes the OpenClaw
config, and restarts the gateway.

## Quick start

```bash
npx -y @looki-ai/openclaw-looki-cli@latest install
```

The wizard walks through:

1. **Language** — English or Chinese (use `--locale` to skip)
2. **Environment** — `Global` / `China` / custom baseUrl
3. **apiKey** — your Looki user API key (`lk-...`)
4. **Forwarding** — auto-detects installed IM plugins (Feishu / WeChat /
   QQ Bot / WhatsApp / Telegram / Discord) and lets you configure forward
   targets for each
5. **Write config** — updates `~/.openclaw/openclaw.json`
6. **Restart gateway** — `openclaw gateway restart` (skippable via
   `--no-restart`)

Once it exits you should be ready to go; no manual JSON editing needed.

## Commands

| Command     | What it does                                                   |
| ----------- | -------------------------------------------------------------- |
| `install`   | Install / update the plugin, then run the full wizard          |
| `configure` | Re-run the wizard without touching `plugins install`           |
| `help`      | Show usage                                                     |

```bash
npx -y @looki-ai/openclaw-looki-cli@latest help
```

## Options

All options work with both `install` and `configure`.

| Option             | Effect                                                     |
| ------------------ | ---------------------------------------------------------- |
| `--base-url <url>` | Skip the environment prompt and use this URL (must be http/https) |
| `--api-key <key>`  | Skip the API key prompt                                    |
| `--locale <code>`  | Force interface language: `zh-CN` or `en`                  |
| `--no-restart`     | Skip `openclaw gateway restart` after writing the config   |

Non-interactive (CI) example:

```bash
npx -y @looki-ai/openclaw-looki-cli@latest \
  --locale en --no-restart \
  --base-url https://open.looki.ai \
  --api-key "$LOOKI_API_KEY" \
  configure
```

## Environments

| Environment | baseUrl                   |
| ----------- | ------------------------- |
| Global      | `https://open.looki.ai`   |
| China       | `https://open.looki.tech` |
| Custom      | Custom URL                |

## Forwarding

The installer scans `~/.openclaw/openclaw.json` for installed downstream IM
plugins and prompts per plugin. Supported:

| channel           | Notes          |
| ----------------- | -------------- |
| `feishu`          | Feishu / Lark  |
| `openclaw-weixin` | WeChat         |
| `qqbot`           | QQ Bot         |
| `whatsapp`        | WhatsApp       |
| `telegram`        | Telegram       |
| `discord`         | Discord        |

Note: candidate targets require the downstream app to send a message to
OpenClaw at least once so a conversation session can form.
