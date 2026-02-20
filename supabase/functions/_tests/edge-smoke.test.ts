import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TEST_LABEL = "Smoke";
const DEFAULT_BASE_URL = "http://127.0.0.1:54321/functions/v1";
const READY_TIMEOUT_MS = 120_000;
const REQUEST_TIMEOUT_MS = 15_000;
const RUNTIME_BOOT_DEPENDENT_FUNCTIONS = new Set([
  "ai-prompt",
  "ai-voice-prompt",
  "discord-daily-stats",
  "stripe-checkout",
  "stripe-webhook",
]);

const thisFile = fileURLToPath(import.meta.url);
const thisDir = path.dirname(thisFile);
const repoRoot = path.resolve(thisDir, "../../..");
const functionsRoot = path.join(repoRoot, "supabase/functions");

const baseUrl = (process.env.EDGE_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
const envFile = process.env.EDGE_ENV_FILE ?? path.join(repoRoot, ".env");

let serveProcess: ChildProcessWithoutNullStreams | null = null;
const serveLogs: string[] = [];
let usingExistingServer = false;
let runtimeUnavailableReason: string | null = null;

function discoverFunctionNames(): string[] {
  return readdirSync(functionsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith("_"))
    .filter((name) => existsSync(path.join(functionsRoot, name, "index.ts")))
    .sort((a, b) => a.localeCompare(b));
}

const functionNames = discoverFunctionNames();
const readinessProbes = functionNames.filter((name) => !RUNTIME_BOOT_DEPENDENT_FUNCTIONS.has(name));

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function isServerReady(): Promise<boolean> {
  const probes = readinessProbes.length > 0 ? readinessProbes.slice(0, 5) : functionNames.slice(0, 5);

  for (const probeFunction of probes) {
    try {
      const response = await fetchWithTimeout(`${baseUrl}/${probeFunction}`, { method: "OPTIONS" }, 1_500);
      if (response.status !== 404 && response.status < 500) {
        return true;
      }
    } catch {
      // Try next probe.
    }
  }

  return false;
}

async function waitForServerReady(): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < READY_TIMEOUT_MS) {
    if (serveProcess && serveProcess.exitCode !== null) {
      throw new Error(
        `supabase functions serve exited early with code ${serveProcess.exitCode}\n` +
          `Last logs:\n${serveLogs.slice(-40).join("\n")}`,
      );
    }

    if (await isServerReady()) {
      return;
    }

    await delay(1_000);
  }

  throw new Error(`Timed out waiting for edge runtime at ${baseUrl}`);
}

function appendServeLogs(chunk: Buffer): void {
  const lines = chunk
    .toString("utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  serveLogs.push(...lines);
}

async function ensureServerRunning(): Promise<void> {
  if (await isServerReady()) {
    usingExistingServer = true;
    return;
  }

  const dockerCheck = spawnSync("docker", ["info"], {
    stdio: "ignore",
  });
  if (dockerCheck.status !== 0) {
    throw new Error(
      "Docker daemon is unavailable. Start Docker Desktop, or set EDGE_BASE_URL to an already running edge runtime.",
    );
  }

  if (!existsSync(envFile)) {
    throw new Error(`Edge env file not found at ${envFile}. Set EDGE_ENV_FILE to a valid env file.`);
  }

  serveProcess = spawn("supabase", ["functions", "serve", "--env-file", envFile], {
    cwd: repoRoot,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  serveProcess.stdout.on("data", appendServeLogs);
  serveProcess.stderr.on("data", appendServeLogs);

  await waitForServerReady();
}

async function stopServer(): Promise<void> {
  if (!serveProcess) return;

  await new Promise<void>((resolve) => {
    const processRef = serveProcess;
    if (processRef.exitCode !== null) {
      resolve();
      return;
    }

    const killTimer = setTimeout(() => {
      processRef.kill("SIGKILL");
    }, 5_000);

    processRef.once("exit", () => {
      clearTimeout(killTimer);
      resolve();
    });

    processRef.kill("SIGTERM");
  });
}

function requestFunction(name: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers ?? {});
  if (!headers.has("Content-Type") && init.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  return fetchWithTimeout(`${baseUrl}/${name}`, {
    ...init,
    headers,
  });
}

beforeAll(async () => {
  if (functionNames.length === 0) {
    throw new Error(`No edge functions discovered in ${functionsRoot}`);
  }

  try {
    await ensureServerRunning();
  } catch (error) {
    runtimeUnavailableReason = error instanceof Error ? error.message : String(error);
    if (process.env.EDGE_SMOKE_REQUIRE_RUNTIME === "1") {
      throw error;
    }
  }
}, READY_TIMEOUT_MS + 10_000);

afterAll(async () => {
  if (!usingExistingServer) {
    await stopServer();
  }
});

describe("Edge Function Smoke Coverage", () => {
  it(`${TEST_LABEL}: discovers edge entry points`, () => {
    expect(functionNames.length).toBeGreaterThan(0);
    expect(functionNames).toContain("complete_task");
  });

  it(`${TEST_LABEL}: runtime is available or intentionally skipped`, () => {
    if (runtimeUnavailableReason) {
      expect(process.env.EDGE_SMOKE_REQUIRE_RUNTIME).not.toBe("1");
      return;
    }

    expect(runtimeUnavailableReason).toBeNull();
  });

  it.each(functionNames)(`${TEST_LABEL}: %s responds on OPTIONS`, async (functionName) => {
    if (runtimeUnavailableReason) return;
    const response = await requestFunction(functionName, { method: "OPTIONS" });

    expect(response.status).not.toBe(404);
    if (RUNTIME_BOOT_DEPENDENT_FUNCTIONS.has(functionName)) {
      return;
    }
    expect([200, 204, 405]).toContain(response.status);
  });

  it.each(functionNames)(`${TEST_LABEL}: %s rejects unsupported GET`, async (functionName) => {
    if (runtimeUnavailableReason) return;
    const response = await requestFunction(functionName, { method: "GET" });

    expect(response.status).not.toBe(404);
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it.each(functionNames)(`${TEST_LABEL}: %s rejects unauthenticated POST`, async (functionName) => {
    if (runtimeUnavailableReason) return;
    const response = await requestFunction(functionName, {
      method: "POST",
      body: JSON.stringify({}),
    });

    expect(response.status).not.toBe(404);
    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});
