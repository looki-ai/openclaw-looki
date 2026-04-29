import type { Translator } from "./i18n.js";

export type DiagnosableError = {
  stderr?: string;
  code?: string;
  message?: string;
};

const NETWORK_PATTERNS = [
  "ENOTFOUND",
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "EAI_AGAIN",
  "network",
  "timeout",
];

function haystack(err: DiagnosableError): string {
  return [err.stderr ?? "", err.message ?? "", err.code ?? ""].join("\n").toLowerCase();
}

export function collectDiagnosticHints(err: DiagnosableError, t: Translator): string[] {
  const hints: string[] = [];
  const text = haystack(err);

  if (text.includes("command not found") || text.includes("is not recognized")) {
    hints.push(t("diagnose.openclawMissing"));
  }
  if (text.includes("eacces") || text.includes("permission denied")) {
    hints.push(t("diagnose.eacces"));
  }
  if (text.includes("enoent") || text.includes("no such file or directory")) {
    hints.push(t("diagnose.enoent"));
  }
  if (NETWORK_PATTERNS.some((pattern) => text.includes(pattern.toLowerCase()))) {
    hints.push(t("diagnose.network"));
  }

  return hints;
}
