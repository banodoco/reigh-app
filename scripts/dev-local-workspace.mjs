#!/usr/bin/env node
/**
 * Start Astrid App against the already-managed neutral workspace.v1 runtime.
 *
 * The runtime owns its endpoint and credential; this launcher only reads the
 * published profile and validates its product-scoped credential before passing
 * it to Vite's server-side proxy. The token is never printed or exposed as a
 * VITE_ value.
 */
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { delimiter, dirname, resolve } from 'node:path';
import { createConnection } from 'node:net';
import { readGeneratedSchemaDigest, schemaDigestMismatch } from './runtime-schema-guard.mjs';
import {
  parseDevLocalWorkspaceArgs,
  validatePreviewOutputDirectory,
  viteChildArgs,
  resolveWorkspaceDiscoveryPath,
} from './dev-local-workspace-options.mjs';

const configuredAstridCheckout = process.env.ASTRID_CHECKOUT?.trim();
const siblingAstridCheckout = resolve(process.cwd(), '..', 'Astrid');
const astridCheckout = configuredAstridCheckout
  || (existsSync(resolve(siblingAstridCheckout, '.astrid-data', 'runtime', 'discovery.json'))
    ? siblingAstridCheckout
    : null);
const configuredAstridPublicCheckout = process.env.ASTRID_PUBLIC_CHECKOUT?.trim();
let discoveryPath;
try {
  discoveryPath = resolveWorkspaceDiscoveryPath({
    discovery: process.env.ASTRID_WORKSPACE_DISCOVERY,
    supportRoot: process.env.ASTRID_SUPPORT_ROOT,
    dataRoot: process.env.ASTRID_RUNTIME_DATA_ROOT,
    home: homedir(),
  });
} catch (error) {
  process.exit(fail(error instanceof Error ? error.message : String(error)) ? 1 : 1);
}
const buildOnly = process.argv.includes('--build');
const port = process.env.PORT ?? '2222';
let launcherOptions;
try {
  launcherOptions = parseDevLocalWorkspaceArgs(process.argv.slice(2));
} catch (error) {
  process.exit(fail(error instanceof Error ? error.message : String(error)) ? 1 : 1);
}
const checkOnly = launcherOptions.checkOnly;
if (buildOnly && launcherOptions.preview) {
  process.exit(fail('--build and --preview are separate rebuild and launch steps') ? 1 : 1);
}
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
const pairedRelayOrigin = process.env.ASTRID_APP_PAIRED_RELAY_ORIGIN?.trim();
const hostedOriginArgumentIndex = process.argv.indexOf('--hosted-origin');
const hostedOriginArgument = hostedOriginArgumentIndex >= 0
  ? process.argv[hostedOriginArgumentIndex + 1]?.trim()
  : undefined;
const hostedOrigin = process.env.ASTRID_APP_LOOPBACK_ORIGIN?.trim() || hostedOriginArgument;
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
const loopbackPort = process.env.ASTRID_APP_LOOPBACK_PORT?.trim() || '0';
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

const RUNTIME_SCOPES = Object.freeze([
  'handshake',
  'projects:read',
  'projects:write',
  'objects:read',
  'objects:write',
  'tasks:read',
  'tasks:write',
]);
const FORBIDDEN_ACTORS = new Set(['owner', 'astrid-pack-host', 'admin', 'worker']);

function readProductCredential(path, label) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8').trim();
  } catch (error) {
    return fail(`cannot read ${label} at ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!raw) return fail(`${label} at ${path} is empty`);
  if (!raw.startsWith('{')) return fail(`${label} at ${path} is not a scoped Astrid product credential`);

  try {
    const credential = JSON.parse(raw);
    const token = typeof credential.token === 'string' ? credential.token.trim() : '';
    const actorId = typeof credential.actor_id === 'string' ? credential.actor_id.trim() : '';
    if (credential.version !== 1 || credential.scope !== 'astrid') {
      return fail(`${label} at ${path} must identify the version 1 astrid product scope`);
    }
    if (!actorId || FORBIDDEN_ACTORS.has(actorId)) {
      return fail(`${label} at ${path} has a forbidden or missing product actor`);
    }
    if (!token) return fail(`${label} at ${path} has no token`);
    return { actorId, token };
  } catch (error) {
    return fail(`cannot read ${label} at ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function exactStringList(actual, expected) {
  return Array.isArray(actual)
    && actual.every((value) => typeof value === 'string')
    && actual.length === expected.length
    && [...actual].sort().every((value, index) => value === [...expected].sort()[index]);
}

function requireIdentity(discovery, discoveryFile, credential) {
  const runtimeInstanceId = typeof discovery.runtime_instance_id === 'string' ? discovery.runtime_instance_id.trim() : '';
  const realmId = typeof discovery.active_realm === 'string' ? discovery.active_realm.trim() : '';
  const realmRoot = typeof discovery.realm_root === 'string' ? discovery.realm_root.trim() : '';
  if (!runtimeInstanceId || !realmId || !realmRoot) {
    return fail('runtime discovery is missing its Astrid profile instance, selected realm, or realm root');
  }

  const catalog = readJson(resolve(dirname(discoveryFile), 'catalog.json'), 'Runtime profile catalog');
  if (!catalog) return null;
  if (catalog.selected_realm_id !== realmId || !Array.isArray(catalog.realms)) {
    return fail('Runtime discovery does not match the selected realm in catalog.json');
  }
  const matches = catalog.realms.filter((row) => row && row.realm_id === realmId);
  if (matches.length !== 1 || matches[0].source_profile !== 'astrid' || typeof matches[0].data_root !== 'string') {
    return fail('selected Runtime catalog row is not one Astrid profile with a data root');
  }
  try {
    const discoveredRoot = realpathSync(realmRoot);
    const catalogRoot = realpathSync(matches[0].data_root);
    if (discoveredRoot !== catalogRoot) return fail('Runtime discovery realm root does not match the selected Astrid catalog root');
  } catch (error) {
    return fail(`cannot resolve the selected Astrid realm root: ${error instanceof Error ? error.message : String(error)}`);
  }
  return { actorId: credential.actorId, realmId, realmRoot, runtimeInstanceId };
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

async function verifyRuntime(endpoint, token, expectedIdentity) {
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
    if (health?.runtime_instance_id !== expectedIdentity.runtimeInstanceId) {
      return fail('Runtime health instance does not match the selected Astrid profile');
    }
    const digestError = schemaDigestMismatch(health?.schema_digest, expectedSchemaDigest);
    if (digestError) return fail(digestError);

    const handshakeResponse = await fetch(new URL('/v1/handshake', endpoint), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        protocol: 'workspace.v1',
        client_name: 'astrid-local-launcher',
        client_version: '1',
        requested_scopes: RUNTIME_SCOPES,
      }),
      signal: AbortSignal.timeout(3000),
    });
    if (!handshakeResponse.ok) return fail(`Runtime identity handshake returned HTTP ${handshakeResponse.status}`);
    const handshake = await handshakeResponse.json();
    const handshakeDigestError = schemaDigestMismatch(handshake?.schema_digest, expectedSchemaDigest);
    if (handshakeDigestError) return fail(handshakeDigestError);
    if (handshake?.protocol !== 'workspace.v1'
      || handshake?.actor_id !== expectedIdentity.actorId
      || FORBIDDEN_ACTORS.has(handshake?.actor_id)
      || handshake?.realm_id !== expectedIdentity.realmId
      || !exactStringList(handshake?.scopes, RUNTIME_SCOPES)) {
      return fail('Runtime handshake actor, realm, protocol, or product scopes do not match the selected Astrid profile');
    }

    const realmResponse = await fetch(new URL('/v1/realm', endpoint), {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(3000),
    });
    if (!realmResponse.ok) return fail(`Runtime realm check returned HTTP ${realmResponse.status}`);
    const realm = await realmResponse.json();
    if (realm?.realm_id !== expectedIdentity.realmId) {
      return fail('Runtime realm does not match the selected Astrid profile');
    }
    return true;
  } catch (error) {
    return fail(`runtime is unavailable at ${endpoint.origin} (run astrid-runtime up --profile astrid): ${error instanceof Error ? error.message : String(error)}`);
  }
}

const discovery = readJson(discoveryPath, 'runtime discovery');
if (!discovery) process.exit(process.exitCode ?? 1);
const endpoint = requireLoopbackEndpoint(discovery.endpoint);
if (!endpoint) process.exit(process.exitCode ?? 1);
const credentialPath = discovery.credential_file;
if (typeof credentialPath !== 'string' || !credentialPath.trim()) process.exit(fail('discovery has no credential_file') ? 1 : 1);
const credential = readProductCredential(credentialPath, 'runtime credential');
if (!credential) process.exit(process.exitCode ?? 1);
const expectedIdentity = requireIdentity(discovery, discoveryPath, credential);
if (!expectedIdentity) process.exit(process.exitCode ?? 1);
if (!(await verifyRuntime(endpoint, credential.token, expectedIdentity))) process.exit(process.exitCode ?? 1);
if (paired && !pairedRelayOrigin) process.exit(fail('--paired requires ASTRID_APP_PAIRED_RELAY_ORIGIN') ? 1 : 1);

const acpToken = process.env.ASTRID_ACP_BRIDGE_TOKEN?.trim() || randomBytes(32).toString('base64url');
const acpPort = process.env.VITE_ASTRID_ACP_BRIDGE_PORT ?? '17335';
const runtimeProxyPort = process.env.VITE_ASTRID_DYNAMIC_PROXY_PORT?.trim() || '17336';
if (!/^\d+$/.test(runtimeProxyPort) || Number(runtimeProxyPort) < 1 || Number(runtimeProxyPort) > 65535) {
  process.exit(fail('VITE_ASTRID_DYNAMIC_PROXY_PORT must be an integer from 1 to 65535') ? 1 : 1);
}

function waitForPort(portValue, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolveReady) => {
    const attempt = () => {
      const socket = createConnection({ host: '127.0.0.1', port: Number(portValue) });
      socket.once('connect', () => {
        socket.destroy();
        resolveReady(true);
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() >= deadline) resolveReady(false);
        else setTimeout(attempt, 50);
      });
    };
    attempt();
  });
}

const env = {
  ...process.env,
  ...(astridCheckout ? { ASTRID_CHECKOUT: astridCheckout } : {}),
  ...(configuredAstridPublicCheckout ? { ASTRID_PUBLIC_CHECKOUT: configuredAstridPublicCheckout } : {}),
  PORT: port,
  VITE_ASTRID_WORKSPACE_V1: '1',
  VITE_ASTRID_BRIDGE_PORT: runtimeProxyPort,
  ASTRID_BRIDGE_TOKEN: credential.token,
  ASTRID_ACP_BRIDGE_TOKEN: acpToken,
  ...(hostedOrigin ? { ASTRID_ACP_LOCAL_MEDIA_ONLY: '1' } : {}),
  ...(hostedOrigin && process.env.ASTRID_ACP_COMMAND?.startsWith('/')
    ? { PATH: `${dirname(process.env.ASTRID_ACP_COMMAND)}${delimiter}${process.env.PATH ?? ''}` }
    : {}),
  // The editor's RuntimeDataProvider talks to `/api/runtime`, which is a
  // separate Vite proxy from the historical `/api/astrid` bridge. Keep the
  // Runtime endpoint and credential server-side so the browser never sees the
  // owner token.
  VITE_WORKSPACE_RUNTIME_URL: `http://127.0.0.1:${runtimeProxyPort}`,
  WORKSPACE_RUNTIME_TOKEN_FILE: credentialPath,
  // Fallback for builds without a live workspace config endpoint. Local preview
  // refreshes these non-secret identifiers from discovery on each page load.
  VITE_WORKSPACE_RUNTIME_EXPECTED_ACTOR_ID: expectedIdentity.actorId,
  VITE_WORKSPACE_RUNTIME_EXPECTED_REALM_ID: expectedIdentity.realmId,
  VITE_WORKSPACE_RUNTIME_EXPECTED_INSTANCE_ID: expectedIdentity.runtimeInstanceId,
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

console.log(`workspace.v1 runtime healthy at ${endpoint.origin}; Astrid App will use ${launcherOptions.preview ? `preview output ${previewDirectory} on port ${port}` : `port ${port}`}`);
if (checkOnly) process.exit(0);

// The build retains this identity for hosted/paired fallback. Local preview
// serves a fresh discovery-backed binding on each page load.
if (buildOnly) {
  const build = spawn('npm', ['run', 'build'], { stdio: 'inherit', env });
  process.on('SIGINT', () => build.kill('SIGINT'));
  process.on('SIGTERM', () => build.kill('SIGTERM'));
  build.on('error', (error) => { fail(`could not build Astrid App: ${error.message}`); process.exitCode = 1; });
  build.on('exit', async (code, signal) => {
    if (code === 0 && !signal && !(await verifyRuntime(endpoint, credential.token, expectedIdentity))) {
      process.exitCode = 1;
      return;
    }
    process.exitCode = code ?? 1;
  });
} else {


let connector;
const runtimeProxy = spawn(process.execPath, ['scripts/runtime-discovery-proxy.mjs'], {
  stdio: 'inherit',
  env: {
    ...env,
    ASTRID_RUNTIME_PROXY_PORT: runtimeProxyPort,
    ASTRID_WORKSPACE_DISCOVERY: discoveryPath,
  },
});
if (!(await waitForPort(runtimeProxyPort))) {
  runtimeProxy.kill('SIGTERM');
  process.exit(fail(`runtime discovery proxy did not start on port ${runtimeProxyPort}`) ? 1 : 1);
}
const acpBridge = spawn('npm', ['run', 'dev:astrid-acp'], {
  stdio: 'inherit',
  env,
});
const gateway = hostedOrigin
  ? spawn(process.execPath, [
    '--import', 'tsx',
    'scripts/astrid-loopback-gateway.ts',
    '--discovery', discoveryPath,
    '--token-file', credentialPath,
    '--origin', hostedOrigin,
    '--acp-endpoint', `http://127.0.0.1:${acpPort}`,
    '--port', loopbackPort,
    ...(process.env.ASTRID_APP_LOOPBACK_AUDIT_LOG?.trim() ? ['--audit-log', process.env.ASTRID_APP_LOOPBACK_AUDIT_LOG.trim()] : []),
    ...(process.env.ASTRID_APP_PAIRED_PRODUCT_ACTOR?.trim() ? ['--actor', process.env.ASTRID_APP_PAIRED_PRODUCT_ACTOR.trim()] : []),
  ], { stdio: 'inherit', env })
  : null;
if (hostedOrigin) console.log(`loopback gateway starting for ${hostedOrigin}; it will print the hosted session link when ready`);
if (paired) {
  connector = spawn('npx', ['tsx', 'scripts/astrid-local-connector.ts', '--discovery', discoveryPath, '--relay-origin', pairedRelayOrigin, ...(resetPairing ? ['--reset-pairing'] : [])], {
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
  env: paired ? { ...env, ASTRID_APP_PAIRED_RELAY_ENABLED: '0', ASTRID_LOCAL_COMPOSE_URL: `http://127.0.0.1:${port}/api/astrid/generation/compose` } : env,
});
let shuttingDown = false;
const shutdown = (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  if (child.exitCode === null) child.kill(signal);
  if (connector?.exitCode === null) connector.kill(signal);
  if (acpBridge.exitCode === null) acpBridge.kill(signal);
  if (gateway?.exitCode === null) gateway.kill(signal);
  if (runtimeProxy.exitCode === null) runtimeProxy.kill(signal);
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
child.on('error', (error) => { fail(`could not start Vite: ${error.message}`); shutdown('SIGTERM'); });
child.on('exit', (code, signal) => {
  if (connector?.exitCode === null) connector.kill('SIGTERM');
  if (acpBridge.exitCode === null) acpBridge.kill('SIGTERM');
  if (gateway?.exitCode === null) gateway.kill('SIGTERM');
  if (runtimeProxy.exitCode === null) runtimeProxy.kill('SIGTERM');
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

}
