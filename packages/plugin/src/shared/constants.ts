export const CHANNEL_ID = "openclaw-looki";
export const PLUGIN_SPEC = "@looki-ai/openclaw-looki@latest";

export const MIN_OPENCLAW_VERSION = "2026.4.24";

export const GLOBAL_BASE_URL = "https://open.looki.ai";
export const CHINA_BASE_URL = "https://open.looki.tech";
export const LOCAL_BASE_URL = "http://localhost:9001";

export const DEFAULT_BASE_URL = GLOBAL_BASE_URL;
export const DEFAULT_ACCOUNT_ID = "default";
export const DEFAULT_POLL_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_EVENTS = 10;

export const DEFAULT_LOCALE = "en";
export type Locale = "zh-CN" | "en";

export const UI_LANGUAGE_OPTIONS = [
  { value: "en", label: "English", hint: "English" },
  { value: "zh-CN", label: "中文", hint: "Simplified Chinese" },
] as const;
