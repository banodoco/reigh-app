#!/usr/bin/env node
/**
 * Start Reigh against the already-managed neutral workspace.v1 runtime.
 *
 * The runtime owns its endpoint and credential; this launcher only reads the
 * published discovery record and passes the owner token to Vite's server-side
 * proxy.  The token is never printed and is intentionally not a VITE_ value.
 */
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

const discoveryPath = resolve(
  process.env.ASTRID_WORKSPACE_DISCOVERY
    ?? `${homedir()}/Library/Application Support/Banodoco/runtime/discovery.json`,
);
const port = process.env.PORT ?? '2222';
const checkOnly = process.argv.includes('--check');

function fail(message) {
  console.error(`dev:local: ${message}`);
  process.exitCode = 1;
  return null;
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    return fail(`cannot read ${label} at ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function requireLoopbackEndpoint(raw) {
  let endpoint;
  try {
    endpoint = new URL(raw);
  } catch {
    return fail(`runtime endpoint is not a valid URL: ${String(raw)}`);
  }
  if (endpoint.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname)) {
    return fail('runtime endpoint must be an http loopback URL');
  }
  if (!endpoint.port || !/^\d+$/.test(endpoint.port)) {
    return fail('runtime endpoint must include an explicit port');
  }
  return endpoint;
}

async function verifyRuntime(endpoint, token) {
  try {
    const response = await fetch(new URL('/v1/health', endpoint), {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return fail(`runtime health check returned HTTP ${response.status}`);
    const health = await response.json();
    if (health?.status !== 'ok' || health?.protocol !== 'workspace.v1') {
      return fail('runtime health check did not report workspace.v1/ok');
    }
    return true;
  } catch (error) {
    return fail(`runtime is unavailable at ${endpoint.origin} (run banodoco-local up --profile astrid): ${error instanceof Error ? error.message : String(error)}`);
  }
}

const discovery = readJson(discoveryPath, 'runtime discovery');
if (!discovery) process.exit(process.exitCode ?? 1);
const endpoint = requireLoopbackEndpoint(discovery.endpoint);
if (!endpoint) process.exit(process.exitCode ?? 1);
const credentialPath = discovery.credential_file;
if (typeof credentialPath !== 'string' || !credentialPath.trim()) process.exit(fail('discovery has no credential_file') ? 1 : 1);
const credential = readJson(credentialPath, 'runtime credential');
if (!credential) process.exit(process.exitCode ?? 1);
const token = typeof credential.token === 'string' ? credential.token.trim() : '';
if (!token) process.exit(fail('runtime credential has no token') ? 1 : 1);
if (!(await verifyRuntime(endpoint, token))) process.exit(process.exitCode ?? 1);

const env = {
  ...process.env,
  PORT: port,
  VITE_ASTRID_WORKSPACE_V1: '1',
  VITE_ASTRID_BRIDGE_PORT: endpoint.port,
  ASTRID_BRIDGE_TOKEN: token,
};

console.log(`workspace.v1 runtime healthy at ${endpoint.origin}; Reigh will use port ${port}`);
if (checkOnly) process.exit(0);

const child = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--strictPort'], {
  stdio: 'inherit',
  env,
});
let shuttingDown = false;
const shutdown = (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  if (child.exitCode === null) child.kill(signal);
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
child.on('error', (error) => { fail(`could not start Vite: ${error.message}`); });
child.on('exit', (code, signal) => {
  if (signal && !shuttingDown) process.kill(process.pid, signal);
  else process.exitCode = code ?? 0;
});
