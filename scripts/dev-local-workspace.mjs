#!/usr/bin/env node
/**
 * Start Reigh against the already-managed neutral workspace.v1 runtime.
 *
 * The runtime owns its endpoint and credential; this launcher only reads the
 * published discovery record and passes the authenticated product token to Vite's server-side
 * proxy.  The token is never printed and is intentionally not a VITE_ value.
 */
import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import {
  authenticateProductCredential,
  readProductCredential,
} from './reigh-product-credential.mjs';

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

async function verifyRuntime(endpoint, credential, callerActor) {
  try {
    const response = await fetch(new URL('/v1/health', endpoint), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return fail(`runtime health check returned HTTP ${response.status}`);
    const health = await response.json();
    if (health?.status !== 'ok' || health?.protocol !== 'workspace.v1') {
      return fail('runtime health check did not report workspace.v1/ok');
    }
    return await authenticateProductCredential(endpoint, credential, callerActor);
  } catch (error) {
    return fail(`runtime is unavailable at ${endpoint.origin} (run banodoco-local up --profile astrid): ${error instanceof Error ? error.message : String(error)}`);
  }
}

const discovery = readJson(discoveryPath, 'runtime discovery');
if (!discovery) process.exit(process.exitCode ?? 1);
const endpoint = requireLoopbackEndpoint(discovery.endpoint);
if (!endpoint) process.exit(process.exitCode ?? 1);
const discoveredCredentialPath = typeof discovery.credential_file === 'string'
  ? discovery.credential_file.trim()
  : '';
const selectedProductCredentialPath = process.env.ASTRID_PRODUCT_TOKEN_FILE?.trim()
  || discoveredCredentialPath;
if (!selectedProductCredentialPath) process.exit(fail('discovery has no credential_file and ASTRID_PRODUCT_TOKEN_FILE is unset') ? 1 : 1);
let productCredential;
try {
  productCredential = readProductCredential(selectedProductCredentialPath);
} catch (error) {
  process.exit(fail(error instanceof Error ? error.message : String(error)) ? 1 : 1);
}
productCredential = await verifyRuntime(
  endpoint,
  productCredential,
  process.env.REIGH_PAIRED_PRODUCT_ACTOR?.trim(),
);
if (!productCredential) process.exit(process.exitCode ?? 1);
if (paired && !pairedRelayOrigin) process.exit(fail('--paired requires REIGH_PAIRED_RELAY_ORIGIN') ? 1 : 1);

const env = {
  ...process.env,
  ...(astridCheckout ? { ASTRID_CHECKOUT: astridCheckout } : {}),
  PORT: port,
  VITE_ASTRID_WORKSPACE_V1: '1',
  VITE_ASTRID_BRIDGE_PORT: endpoint.port,
  ASTRID_BRIDGE_TOKEN: productCredential.token,
  // The editor's RuntimeDataProvider talks to `/api/runtime`, which is a
  // separate Vite proxy from the historical `/api/astrid` bridge. Keep the
  // Runtime endpoint and credential server-side so the browser never sees the
  // authenticated product token.
  VITE_WORKSPACE_RUNTIME_URL: endpoint.origin,
  ASTRID_PRODUCT_TOKEN_FILE: selectedProductCredentialPath,
  // Server-only Vite proxy input. These exact bytes passed Runtime's full
  // identity, privilege, and source-generation proof above; Vite must not
  // reread the mutable credential path.
  WORKSPACE_RUNTIME_TOKEN: productCredential.token,
  REIGH_PAIRED_PRODUCT_ACTOR: productCredential.actorId,
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
