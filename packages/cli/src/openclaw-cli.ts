import { execSync, spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CHANNEL_ID,
  MIN_OPENCLAW_VERSION,
  PLUGIN_SPEC,
  compareVersions,
  getOpenclawStateDir,
  parseVersion,
} from "@looki-ai/openclaw-looki/shared";

import { error, log } from "./ui.js";
import { collectDiagnosticHints } from "./diagnose.js";
import type { Translator } from "./i18n.js";

export class ShellError extends Error {
  stderr: string;
  constructor(message: string, stderr: string) {
    super(message);
    this.name = "ShellError";
    this.stderr = stderr;
  }
}

export type RunOptions = { silent?: boolean };

export function run(cmd: string, args: string[], options: RunOptions = {}): string {
  const silent = options.silent ?? true;
  const stdio: "inherit" | ["pipe", "pipe", "pipe"] = silent ? ["pipe", "pipe", "pipe"] : "inherit";
  const result = spawnSync(cmd, args, { stdio });
  if (result.status !== 0) {
    const stderr = silent ? (result.stderr?.toString() ?? "") : "";
    throw new ShellError(
      `Command failed with exit code ${result.status}: ${cmd} ${args.join(" ")}`,
      stderr,
    );
  }
  return silent ? (result.stdout?.toString() ?? "").trim() : "";
}

export type StreamOptions = {
  onLine?: (line: string) => void;
};

export function runStreaming(
  cmd: string,
  args: string[],
  options: StreamOptions = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    let stdoutBuffer = "";

    child.stdout.setEncoding("utf-8");
    child.stderr.setEncoding("utf-8");

    child.stdout.on("data", (chunk: string) => {
      stdoutChunks.push(chunk);
      stdoutBuffer += chunk;
      let idx = stdoutBuffer.indexOf("\n");
      while (idx !== -1) {
        const line = stdoutBuffer.slice(0, idx).trim();
        stdoutBuffer = stdoutBuffer.slice(idx + 1);
        if (line) options.onLine?.(line);
        idx = stdoutBuffer.indexOf("\n");
      }
    });
    child.stderr.on("data", (chunk: string) => stderrChunks.push(chunk));

    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      const tail = stdoutBuffer.trim();
      if (tail) options.onLine?.(tail);
      const stdout = stdoutChunks.join("").trim();
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(
          new ShellError(
            `Command failed with exit code ${code}: ${cmd} ${args.join(" ")}`,
            stderrChunks.join(""),
          ),
        );
      }
    });
  });
}

export function which(bin: string): string | null {
  const locator = process.platform === "win32" ? "where" : "which";
  try {
    return execSync(`${locator} ${bin}`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}

export function getCliVersion(): string | null {
  try {
    const require = createRequire(import.meta.url);
    const pkgPath = require.resolve("@looki-ai/openclaw-looki-cli/package.json", {
      paths: [path.dirname(fileURLToPath(import.meta.url))],
    });
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version?: string };
    return pkg.version ?? null;
  } catch {
    try {
      const here = path.dirname(fileURLToPath(import.meta.url));
      const pkg = JSON.parse(readFileSync(path.join(here, "..", "package.json"), "utf-8")) as {
        version?: string;
      };
      return pkg.version ?? null;
    } catch {
      return null;
    }
  }
}

export function getInstalledPluginVersion(): string | null {
  try {
    const pkgPath = path.join(
      getOpenclawStateDir(),
      "extensions",
      CHANNEL_ID,
      "package.json",
    );
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version?: string };
    return pkg.version ?? null;
  } catch {
    return null;
  }
}

export function getOpenclawVersion(): string | null {
  try {
    const raw = run("openclaw", ["--version"]);
    const parsed = parseVersion(raw);
    if (parsed) return parsed.join(".");
    const match = raw.match(/(\d+\.\d+\.\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export function ensureOpenclawInstalled(t: Translator): void {
  if (!which("openclaw")) {
    error(t("openclaw.missing"));
    console.log("  npm install -g openclaw");
    console.log(t("openclaw.docsHint"));
    process.exit(1);
  }
  log(t("openclaw.found"));
}

export function ensureHostVersion(t: Translator): string {
  const version = getOpenclawVersion();
  if (!version) {
    error(t("version.missing"));
    process.exit(1);
  }

  if (compareVersions(version, MIN_OPENCLAW_VERSION) < 0) {
    error(t("version.tooLow", { version }));
    process.exit(1);
  }

  log(t("version.detected", { version }));
  return version;
}

export type InstallPluginOptions = {
  onProgress?: (stage: "install-start" | "install-done") => void;
  onLine?: (line: string) => void;
};

export async function installPlugin(
  t: Translator,
  opts: InstallPluginOptions = {},
): Promise<void> {
  opts.onProgress?.("install-start");
  try {
    await runStreaming("openclaw", ["plugins", "install", PLUGIN_SPEC, "--force"], {
      onLine: opts.onLine,
    });
    opts.onProgress?.("install-done");
  } catch (installErr) {
    error(t("install.failedManual"));
    if (installErr instanceof ShellError && installErr.stderr) {
      console.error(installErr.stderr);
    }
    for (const hint of collectDiagnosticHints(installErr as ShellError, t)) {
      log(hint);
    }
    console.log(`  openclaw plugins install "${PLUGIN_SPEC}" --force`);
    process.exit(1);
  }
}

export function restartGateway(t: Translator): void {
  try {
    run("openclaw", ["gateway", "restart"], { silent: false });
    log(t("restart.done"));
  } catch (restartErr) {
    error(t("restart.failedManual"));
    for (const hint of collectDiagnosticHints(restartErr as ShellError, t)) {
      log(hint);
    }
    console.log("  openclaw gateway restart");
  }
}
