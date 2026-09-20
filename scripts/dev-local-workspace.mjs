#!/usr/bin/env node
/**
 * Start Reigh against the already-managed neutral workspace.v1 runtime.
 *
 * The runtime owns its endpoint and credential; this launcher only reads the
 * published discovery record and passes the owner token to Vite's server-side
 * proxy.  The token is never printed and is intentionally not a VITE_ value.
 */
import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

const configuredAstridCheckout = process.env.ASTRID_CHECKOUT?.trim();
const siblingAstridCheckout = resolve(process.cwd(), '..', 'Astrid');
const astridCheckout = configuredAstridCheckout
  || (existsSync(resolve(siblingAstridCheckout, '.astrid-data', 'runtime', 'discovery.json'))
    ? siblingAstridCheckout
    : null);
const defaultDiscoveryPath = astridCheckout
  ? resolve(astridCheckout, '.astrid-data', 'runtime', 'discovery.json')
  : `${homedir()}/Library/Application Support/Banodoco/runtime/discovery.json`;
const discoveryPath = resolve(process.env.ASTRID_WORKSPACE_DISCOVERY ?? defaultDiscoveryPath);
const port = process.env.PORT ?? '2222';
const checkOnly = process.argv.includes('--check');
const paired = process.argv.includes('--paired');
const resetPairing = process.argv.includes('--reset-pairing');
const pairedRelayOrigin = process.env.REIGH_PAIRED_RELAY_ORIGIN?.trim();

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

function readCredentialToken(path, label) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8').trim();
  } catch (error) {
    return fail(`cannot read ${label} at ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!raw) return fail(`${label} at ${path} is empty`);

  if (!raw.startsWith('{')) return raw;

  try {
    const credential = JSON.parse(raw);
    const token = typeof credential.token === 'string' ? credential.token.trim() : '';
    return token || fail(`${label} at ${path} has no token`);
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
const token = readCredentialToken(credentialPath, 'runtime credential');
if (!token) process.exit(process.exitCode ?? 1);
if (!(await verifyRuntime(endpoint, token))) process.exit(process.exitCode ?? 1);
if (paired && !pairedRelayOrigin) process.exit(fail('--paired requires REIGH_PAIRED_RELAY_ORIGIN') ? 1 : 1);

const env = {
  ...process.env,
  ...(astridCheckout ? { ASTRID_CHECKOUT: astridCheckout } : {}),
  PORT: port,
  VITE_ASTRID_WORKSPACE_V1: '1',
  VITE_ASTRID_BRIDGE_PORT: endpoint.port,
  ASTRID_BRIDGE_TOKEN: token,
  // The editor's RuntimeDataProvider talks to `/api/runtime`, which is a
  // separate Vite proxy from the historical `/api/astrid` bridge. Keep the
  // Runtime endpoint and credential server-side so the browser never sees the
  // owner token.
  VITE_WORKSPACE_RUNTIME_URL: endpoint.origin,
  WORKSPACE_RUNTIME_TOKEN_FILE: credentialPath,
  ASTRID_LOCAL_COMPOSE_URL: `http://127.0.0.1:${port}/api/astrid/generation/compose`,
  // The ACP bridge is a sibling user-machine process. Keep its cwd explicit so
  // OMP owns one stable session store and the browser cannot redirect it.
  ASTRID_ACP_CWD: process.env.ASTRID_ACP_CWD ?? process.cwd(),
  // Omit the profile by default so ACP uses the same model/auth configuration
  // as the user's normal OMP installation. An explicit profile remains a
  // supported escape hatch for isolated deployments.
  ...(process.env.ASTRID_ACP_PROFILE?.trim()
    ? { ASTRID_ACP_PROFILE: process.env.ASTRID_ACP_PROFILE.trim() }
    : {}),
  ASTRID_ACP_BRIDGE_PORT: process.env.VITE_ASTRID_ACP_BRIDGE_PORT ?? '17335',
};

console.log(`workspace.v1 runtime healthy at ${endpoint.origin}; Reigh will use port ${port}`);
if (checkOnly) process.exit(0);

let connector;
const acpBridge = spawn('npm', ['run', 'dev:astrid-acp'], {
  stdio: 'inherit',
  env,
});
if (paired) {
  connector = spawn('npx', ['tsx', 'scripts/reigh-local-connector.ts', '--discovery', discoveryPath, '--relay-origin', pairedRelayOrigin, ...(resetPairing ? ['--reset-pairing'] : [])], {
    stdio: 'inherit',
    env,
  });
}

const child = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--strictPort'], {
  stdio: 'inherit',
  // The local Vite process is the connector's fixed compose/ACP destination;
  // it must not install another relay and accidentally loop back to itself.
  env: paired ? { ...env, REIGH_PAIRED_RELAY_ENABLED: '0', ASTRID_LOCAL_COMPOSE_URL: `http://127.0.0.1:${port}/api/astrid/generation/compose` } : env,
});
let shuttingDown = false;
const shutdown = (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  if (child.exitCode === null) child.kill(signal);
  if (connector?.exitCode === null) connector.kill(signal);
  if (acpBridge.exitCode === null) acpBridge.kill(signal);
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
child.on('error', (error) => { fail(`could not start Vite: ${error.message}`); });
child.on('exit', (code, signal) => {
  if (connector?.exitCode === null) connector.kill('SIGTERM');
  if (acpBridge.exitCode === null) acpBridge.kill('SIGTERM');
  if (signal && !shuttingDown) process.kill(process.pid, signal);
  else process.exitCode = code ?? 0;
});
connector?.on('error', (error) => { fail(`could not start paired connector: ${error.message}`); });
acpBridge.on('error', (error) => { fail(`could not start Astrid ACP bridge: ${error.message}`); });
