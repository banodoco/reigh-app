#!/usr/bin/env node
/**
 * Start Reigh against the already-managed neutral workspace.v1 runtime.
 *
 * The runtime owns its endpoint and credential; this launcher only reads the
 * published discovery record and passes the owner token to Vite's server-side
 * proxy.  The token is never printed and is intentionally not a VITE_ value.
 */
import { existsSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { delimiter, dirname, resolve } from 'node:path';
import { readGeneratedSchemaDigest, schemaDigestMismatch } from './runtime-schema-guard.mjs';
import {
  parseDevLocalWorkspaceArgs,
  validatePreviewOutputDirectory,
  viteChildArgs,
} from './dev-local-workspace-options.mjs';

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
let launcherOptions;
try {
  launcherOptions = parseDevLocalWorkspaceArgs(process.argv.slice(2));
} catch (error) {
  process.exit(fail(error instanceof Error ? error.message : String(error)) ? 1 : 1);
}
const checkOnly = launcherOptions.checkOnly;
const paired = launcherOptions.paired;
const resetPairing = launcherOptions.resetPairing;
let previewDirectory = null;
if (launcherOptions.preview) {
  try {
    previewDirectory = validatePreviewOutputDirectory(launcherOptions.previewDir);
  } catch (error) {
    process.exit(fail(error instanceof Error ? error.message : String(error)) ? 1 : 1);
  }
}
const pairedRelayOrigin = process.env.REIGH_PAIRED_RELAY_ORIGIN?.trim();
const hostedOriginArgumentIndex = process.argv.indexOf('--hosted-origin');
const hostedOriginArgument = hostedOriginArgumentIndex >= 0
  ? process.argv[hostedOriginArgumentIndex + 1]?.trim()
  : undefined;
const hostedOrigin = process.env.REIGH_LOOPBACK_ORIGIN?.trim() || hostedOriginArgument;
if (hostedOriginArgumentIndex >= 0 && (!hostedOriginArgument || hostedOriginArgument.startsWith('--'))) {
  console.error('dev:local: --hosted-origin requires an exact HTTPS origin');
  process.exit(1);
}
if (hostedOrigin) {
  let parsed;
  try {
    parsed = new URL(hostedOrigin);
  } catch {
    console.error('dev:local: hosted origin must be an exact HTTPS origin');
    process.exit(1);
  }
  if (parsed.protocol !== 'https:' || parsed.origin !== hostedOrigin) {
    console.error('dev:local: hosted origin must be an exact HTTPS origin');
    process.exit(1);
  }
}
const loopbackPort = process.env.REIGH_LOOPBACK_PORT?.trim() || '0';
const generatedMetadataPath = resolve(process.cwd(), 'src/integrations/runtime/generated-contract-metadata.ts');

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
  let expectedSchemaDigest;
  try {
    expectedSchemaDigest = readGeneratedSchemaDigest(generatedMetadataPath);
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }

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
    const digestError = schemaDigestMismatch(health?.schema_digest, expectedSchemaDigest);
    if (digestError) return fail(digestError);
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

const acpToken = process.env.ASTRID_ACP_BRIDGE_TOKEN?.trim() || randomBytes(32).toString('base64url');
const acpPort = process.env.VITE_ASTRID_ACP_BRIDGE_PORT ?? '17335';
const env = {
  ...process.env,
  ...(astridCheckout ? { ASTRID_CHECKOUT: astridCheckout } : {}),
  PORT: port,
  VITE_ASTRID_WORKSPACE_V1: '1',
  VITE_ASTRID_BRIDGE_PORT: endpoint.port,
  ASTRID_BRIDGE_TOKEN: token,
  ASTRID_ACP_BRIDGE_TOKEN: acpToken,
  ...(hostedOrigin ? { ASTRID_ACP_LOCAL_MEDIA_ONLY: '1' } : {}),
  ...(hostedOrigin && process.env.ASTRID_ACP_COMMAND?.startsWith('/')
    ? { PATH: `${dirname(process.env.ASTRID_ACP_COMMAND)}${delimiter}${process.env.PATH ?? ''}` }
    : {}),
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
  ASTRID_ACP_BRIDGE_PORT: acpPort,
};

console.log(`workspace.v1 runtime healthy at ${endpoint.origin}; Reigh will use ${launcherOptions.preview ? `preview output ${previewDirectory} on port ${port}` : `port ${port}`}`);
if (checkOnly) process.exit(0);

let connector;
const acpBridge = spawn('npm', ['run', 'dev:astrid-acp'], {
  stdio: 'inherit',
  env,
});
const gateway = hostedOrigin
  ? spawn(process.execPath, [
    '--import', 'tsx',
    'scripts/reigh-loopback-gateway.ts',
    '--discovery', discoveryPath,
    '--token-file', credentialPath,
    '--origin', hostedOrigin,
    '--acp-endpoint', `http://127.0.0.1:${acpPort}`,
    '--port', loopbackPort,
    ...(process.env.REIGH_LOOPBACK_AUDIT_LOG?.trim() ? ['--audit-log', process.env.REIGH_LOOPBACK_AUDIT_LOG.trim()] : []),
    ...(process.env.REIGH_PAIRED_PRODUCT_ACTOR?.trim() ? ['--actor', process.env.REIGH_PAIRED_PRODUCT_ACTOR.trim()] : []),
  ], { stdio: 'inherit', env })
  : null;
if (hostedOrigin) console.log(`loopback gateway starting for ${hostedOrigin}; it will print the hosted session link when ready`);
if (paired) {
  connector = spawn('npx', ['tsx', 'scripts/reigh-local-connector.ts', '--discovery', discoveryPath, '--relay-origin', pairedRelayOrigin, ...(resetPairing ? ['--reset-pairing'] : [])], {
    stdio: 'inherit',
    env,
  });
}

const child = spawn('npm', viteChildArgs({
  preview: launcherOptions.preview,
  previewDir: previewDirectory,
}), {
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
  if (gateway?.exitCode === null) gateway.kill(signal);
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
child.on('error', (error) => { fail(`could not start Vite: ${error.message}`); shutdown('SIGTERM'); });
child.on('exit', (code, signal) => {
  if (connector?.exitCode === null) connector.kill('SIGTERM');
  if (acpBridge.exitCode === null) acpBridge.kill('SIGTERM');
  if (gateway?.exitCode === null) gateway.kill('SIGTERM');
  if (signal && !shuttingDown) process.kill(process.pid, signal);
  else process.exitCode = code ?? 0;
});
connector?.on('error', (error) => { fail(`could not start paired connector: ${error.message}`); });
acpBridge.on('error', (error) => { fail(`could not start Astrid ACP bridge: ${error.message}`); shutdown('SIGTERM'); });
acpBridge.on('exit', (code, signal) => {
  if (!shuttingDown) {
    fail(`Astrid ACP bridge exited${signal ? ` with ${signal}` : ` with code ${code}`}; ACP is offline`);
    shutdown('SIGTERM');
  }
});
gateway?.on('error', (error) => { fail(`could not start loopback gateway: ${error.message}`); shutdown('SIGTERM'); });
gateway?.on('exit', (code, signal) => {
  if (!shuttingDown) {
    fail(`loopback gateway exited${signal ? ` with ${signal}` : ` with code ${code}`}; hosted session link is unavailable`);
    shutdown('SIGTERM');
  }
});
