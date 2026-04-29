export type SupportedForwardPlugin = {
  id: string;
  detectIds: string[];
  label: string;
  hint: string;
  channel: string;
  accountId?: string;
  placeholder?: string;
};

export const SUPPORTED_FORWARD_PLUGINS: readonly SupportedForwardPlugin[] = [
  {
    id: "whatsapp",
    detectIds: ["whatsapp", "@openclaw/whatsapp"],
    label: "WhatsApp",
    hint: "Forward the Looki agent output to WhatsApp",
    channel: "whatsapp",
    accountId: "default",
    placeholder: "1234567890@s.whatsapp.net",
  },
  {
    id: "telegram",
    detectIds: ["telegram", "@openclaw/telegram"],
    label: "Telegram",
    hint: "Forward the Looki agent output to Telegram",
    channel: "telegram",
    accountId: "default",
    placeholder: "123456789",
  },
  {
    id: "discord",
    detectIds: ["discord", "@openclaw/discord"],
    label: "Discord",
    hint: "Forward the Looki agent output to Discord",
    channel: "discord",
    accountId: "default",
    placeholder: "channel_id",
  },
  {
    id: "openclaw-lark",
    detectIds: ["feishu", "openclaw-lark", "@larksuite/openclaw-lark"],
    label: "Lark",
    hint: "Forward the Looki agent output to Lark",
    channel: "feishu",
    accountId: "default",
    placeholder: "ou_xxx",
  },
  {
    id: "openclaw-weixin",
    detectIds: ["openclaw-weixin", "@tencent-weixin/openclaw-weixin"],
    label: "WeChat",
    hint: "Forward the Looki agent output to WeChat",
    channel: "openclaw-weixin",
    placeholder: "weixin_user_id",
  },
  {
    id: "qqbot",
    detectIds: ["qqbot", "@openclaw/qqbot"],
    label: "QQ Bot",
    hint: "Forward the Looki agent output to QQ Bot",
    channel: "qqbot",
    accountId: "default",
    placeholder: "qqbot:c2c:openid",
  },
];

export function defaultForwardAccountId(target: SupportedForwardPlugin): string {
  return target.accountId ?? "";
}
