import fs from "node:fs";
import path from "node:path";

import { getOpenclawStateDir, type OpenClawConfigShape } from "@looki-ai/openclaw-looki/shared";

export type OpenclawConfig = OpenClawConfigShape;

export function getConfigPath(): string {
  return path.join(getOpenclawStateDir(), "openclaw.json");
}

export class ConfigReadError extends Error {
  constructor(
    public readonly path: string,
    public readonly cause: unknown,
  ) {
    super(`Failed to read OpenClaw config at ${path}`);
    this.name = "ConfigReadError";
  }
}

export function readConfig(): OpenclawConfig {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) return {};
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as OpenclawConfig;
  } catch (cause) {
    throw new ConfigReadError(configPath, cause);
  }
}

export function writeConfig(config: OpenclawConfig): void {
  const stateDir = getOpenclawStateDir();
  const configPath = getConfigPath();
  fs.mkdirSync(stateDir, { recursive: true });
  const tmpPath = `${configPath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(config, null, 2)}\n`);
  fs.renameSync(tmpPath, configPath);
}
