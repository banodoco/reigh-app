import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface HarnessEnv {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  testUserEmail: string;
  testUserPassword: string;
  envFilePath: string;
}

let cachedEnv: HarnessEnv | null = null;

function harnessDir(): string {
  return path.dirname(fileURLToPath(import.meta.url));
}

export function getAstridAppRoot(): string {
  return path.resolve(harnessDir(), "../../../..");
}

function stripWrappingQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function parseEnvFile(contents: string): Record<string, string> {
  const parsed: Record<string, string> = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const normalized = line.startsWith("export ") ? line.slice(7) : line;
    const separatorIndex = normalized.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = normalized.slice(0, separatorIndex).trim();
    const value = normalized.slice(separatorIndex + 1).trim();
    if (!key) {
      continue;
    }

    parsed[key] = stripWrappingQuotes(value);
  }

  return parsed;
}

function resolveEnvFilePath(): string {
  const configuredPath = process.env.HARNESS_ENV_FILE?.trim();
  if (configuredPath) {
    return path.isAbsolute(configuredPath)
      ? configuredPath
      : path.resolve(process.cwd(), configuredPath);
  }

  return path.join(getAstridAppRoot(), ".env.local");
}

function requireEnvValue(
  source: Record<string, string | undefined>,
  key: "SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY" | "TEST_USER_EMAIL" | "TEST_USER_PASSWORD",
  envFilePath: string,
): string {
  const value = source[key]?.trim();
  if (!value) {
    throw new Error(`Missing ${key}. Add it to ${envFilePath} or export it in the current shell.`);
  }

  return value;
}

export function loadHarnessEnv(): HarnessEnv {
  if (cachedEnv) {
    return cachedEnv;
  }

  const envFilePath = resolveEnvFilePath();
  const fileVars = existsSync(envFilePath)
    ? parseEnvFile(readFileSync(envFilePath, "utf8"))
    : {};
  const merged = {
    ...fileVars,
    SUPABASE_URL: process.env.SUPABASE_URL ?? fileVars.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? fileVars.SUPABASE_SERVICE_ROLE_KEY,
    TEST_USER_EMAIL: process.env.TEST_USER_EMAIL ?? fileVars.TEST_USER_EMAIL,
    TEST_USER_PASSWORD: process.env.TEST_USER_PASSWORD ?? fileVars.TEST_USER_PASSWORD,
  };

  cachedEnv = {
    supabaseUrl: requireEnvValue(merged, "SUPABASE_URL", envFilePath).replace(/\/$/, ""),
    supabaseServiceRoleKey: requireEnvValue(merged, "SUPABASE_SERVICE_ROLE_KEY", envFilePath),
    testUserEmail: requireEnvValue(merged, "TEST_USER_EMAIL", envFilePath),
    testUserPassword: requireEnvValue(merged, "TEST_USER_PASSWORD", envFilePath),
    envFilePath,
  };

  return cachedEnv;
}
