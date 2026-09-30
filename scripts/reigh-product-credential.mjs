import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

export const PRODUCT_SCOPES = Object.freeze([
  'handshake', 'projects:read', 'projects:write', 'tasks:read', 'tasks:write',
  'objects:read', 'objects:write',
]);

// Runtime does not currently expose the complete stored scope set. These
// probes cover every non-product scope in the bound Runtime credential model.
// Each request is intentionally invalid after authorization and therefore
// cannot reach its mutation: a least-privilege product credential must fail at
// authorization with the exact missing-scope response.
const PRIVILEGE_SCOPES = Object.freeze([
  'credentials:provision',
  'worker:execute',
  'worker:register',
]);
const CREDENTIAL_SOURCE_BINDINGS = new WeakMap();

function fail(message) {
  throw new Error(`product credential: ${message}`);
}

function parseJson(raw, label) {
  try { return JSON.parse(raw); }
  catch { return fail(`${label} JSON is malformed`); }
}

function statIdentity(stat) {
  return ['dev', 'ino', 'uid', 'mode', 'size', 'mtimeNs', 'ctimeNs']
    .map((key) => String(stat[key]));
}

function credentialSourceSnapshot(credentialPath) {
  const path = resolve(credentialPath);
  let before;
  let bytes;
  let after;
  try {
    before = lstatSync(path, { bigint: true });
    if (!before.isFile()) fail('credential source is not a regular file');
    if (typeof process.getuid === 'function' && before.uid !== BigInt(process.getuid())) {
      fail('credential source is not owned by the current user');
    }
    if ((before.mode & 0o077n) !== 0n) fail('credential source permissions are broader than 0600');
    bytes = readFileSync(path);
    after = lstatSync(path, { bigint: true });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('product credential:')) throw error;
    return fail(`cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (
    !after.isFile()
    || statIdentity(before).some((value, index) => value !== statIdentity(after)[index])
  ) fail('credential source changed while it was read');
  return {
    path,
    bytes,
    fingerprint: [...statIdentity(after), createHash('sha256').update(bytes).digest('hex')],
  };
}

function bindCredential(value, snapshot) {
  const credential = Object.freeze(value);
  CREDENTIAL_SOURCE_BINDINGS.set(credential, {
    path: snapshot.path,
    fingerprint: snapshot.fingerprint,
    tokenSha256: createHash('sha256').update(value.token).digest('hex'),
  });
  return credential;
}

function requireStableCredentialSource(credential, binding) {
  if (createHash('sha256').update(credential.token).digest('hex') !== binding.tokenSha256) {
    fail('credential token changed after source binding');
  }
  const current = credentialSourceSnapshot(binding.path);
  if (
    current.fingerprint.length !== binding.fingerprint.length
    || current.fingerprint.some((value, index) => value !== binding.fingerprint[index])
  ) fail('credential source changed during Runtime authentication');
}

export function exactActorForToken(token) {
  return `astrid-${createHash('sha256').update(token).digest('hex').slice(0, 24)}`;
}

/**
 * Read the authenticated Astrid product credential published by Runtime
 * bootstrap. Local actor metadata is only an assertion to compare with the
 * Runtime-authenticated identity; it never establishes authority by itself.
 */
export function readProductCredential(credentialPath) {
  const snapshot = credentialSourceSnapshot(credentialPath);
  const raw = snapshot.bytes.toString('utf8').trim();
  if (!raw) return fail('credential is empty');

  if (raw.startsWith('{')) {
    const value = parseJson(raw, 'credential');
    if (
      value?.version !== 1
      || value?.scope !== 'astrid'
      || typeof value?.actor_id !== 'string'
      || typeof value?.token !== 'string'
      || !/^[0-9a-f]{64}$/.test(value.token)
      || value.actor_id !== exactActorForToken(value.token)
    ) return fail('JSON is not the canonical Runtime bootstrap Astrid credential');
    return bindCredential({ token: value.token, assertedActorId: value.actor_id, source: 'runtime-bootstrap' }, snapshot);
  }

  const metadataName = basename(credentialPath).replace(/\.token$/, '') || 'product';
  const metadataPath = resolve(dirname(credentialPath), `${metadataName}.json`);
  if (existsSync(metadataPath)) {
    const metadata = parseJson(readFileSync(metadataPath, 'utf8'), 'credential metadata');
    if (typeof metadata?.actor !== 'string' || !metadata.actor) {
      return fail('credential metadata has no actor assertion');
    }
    return bindCredential({ token: raw, assertedActorId: metadata.actor, source: 'explicit-token-metadata' }, snapshot);
  }

  return bindCredential({ token: raw, assertedActorId: '', source: 'explicit-token' }, snapshot);
}

function exactProductScopes(scopes) {
  if (!Array.isArray(scopes) || scopes.some((scope) => typeof scope !== 'string' || !scope)) return false;
  const actual = [...new Set(scopes)].sort();
  const expected = [...PRODUCT_SCOPES].sort();
  return scopes.length === actual.length
    && actual.length === expected.length
    && actual.every((scope, index) => scope === expected[index]);
}

/**
 * Validate identity returned by Runtime after it authenticated the bearer.
 * File metadata and caller overrides are optional equality assertions only.
 */
export function validateRuntimeProductIdentity(value, assertions = {}) {
  if (!value || typeof value !== 'object') fail('Runtime identity response is malformed');
  const actorId = typeof value.actor_id === 'string' ? value.actor_id : '';
  const token = typeof assertions.token === 'string' ? assertions.token : '';
  if (!actorId || actorId === 'owner' || actorId === 'astrid-pack-host') {
    fail('Runtime authenticated a reserved owner or Worker actor');
  }
  if (!token || actorId !== exactActorForToken(token)) {
    fail('Runtime authenticated actor is not the canonical product actor for this token');
  }
  if (!exactProductScopes(value.scopes)) {
    fail('Runtime authenticated scopes are not the exact product scope set');
  }
  for (const [label, assertedActorId] of Object.entries(assertions)) {
    if (label === 'token') continue;
    if (assertedActorId && assertedActorId !== actorId) {
      fail(`${label} does not match the Runtime-authenticated product actor`);
    }
  }
  return { actorId, scopes: [...PRODUCT_SCOPES] };
}

async function runtimeRequest(endpoint, token, path, requestBody) {
  let response;
  try {
    response = await fetch(new URL(path, endpoint), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(3000),
    });
  } catch (error) {
    return fail(`Runtime privileged-scope check failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  let responseBody;
  try { responseBody = await response.json(); }
  catch { responseBody = null; }
  return { response, body: responseBody };
}

async function requireMissingAdmin(endpoint, token) {
  // Authorization runs before body validation in the bound Runtime. An empty
  // backup body can therefore prove admin is absent without invoking backup.
  const { response, body } = await runtimeRequest(endpoint, token, '/v1/backup', {});
  if (
    response.status !== 401
    || body?.code !== 'unauthorized'
    || body?.message !== 'credential lacks required scope'
    || body?.details?.scope !== 'admin'
  ) {
    fail('Runtime did not prove absence of privileged scope admin');
  }
}

async function requireMissingNegotiablePrivilege(endpoint, token, scope) {
  // Handshake negotiation is read-only. Runtime returns an exact 401 when the
  // authenticated credential cannot negotiate a requested non-admin scope.
  const { response, body } = await runtimeRequest(endpoint, token, '/v1/handshake', {
    protocol: 'workspace.v1',
    client_name: 'reigh-product-credential-privilege-check',
    client_version: '1',
    requested_scopes: [scope],
  });
  if (
    response.status !== 401
    || body?.code !== 'unauthorized'
    || body?.message !== 'credential cannot negotiate requested scopes'
    || !Array.isArray(body?.details?.scopes)
    || body.details.scopes.length !== 1
    || body.details.scopes[0] !== scope
  ) {
    fail(`Runtime did not prove absence of privileged scope ${scope}`);
  }
}

async function requireNoRuntimePrivileges(endpoint, token) {
  await requireMissingAdmin(endpoint, token);
  for (const scope of PRIVILEGE_SCOPES) {
    await requireMissingNegotiablePrivilege(endpoint, token, scope);
  }
}

/**
 * Ask Runtime to authenticate the bearer and disclose its actor plus negotiated
 * scopes.
 * Token bytes never appear in an error or return value other than the original
 * credential object supplied by the caller.
 */
export async function authenticateProductCredential(endpoint, credential, callerActor = '') {
  const sourceBinding = CREDENTIAL_SOURCE_BINDINGS.get(credential);
  if (!sourceBinding) fail('credential has no verified source binding');
  let response;
  try {
    response = await fetch(new URL('/v1/handshake', endpoint), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${credential.token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        protocol: 'workspace.v1',
        client_name: 'reigh-product-credential-check',
        client_version: '1',
        requested_scopes: PRODUCT_SCOPES,
      }),
      signal: AbortSignal.timeout(3000),
    });
  } catch (error) {
    return fail(`Runtime identity check failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) fail(`Runtime identity check returned HTTP ${response.status}`);
  let identity;
  try { identity = await response.json(); }
  catch { return fail('Runtime identity response is not valid JSON'); }
  const authenticated = validateRuntimeProductIdentity(identity, {
    token: credential.token,
    'credential actor assertion': credential.assertedActorId,
    'explicit REIGH_PAIRED_PRODUCT_ACTOR': callerActor,
  });
  await requireNoRuntimePrivileges(endpoint, credential.token);
  requireStableCredentialSource(credential, sourceBinding);
  return { ...credential, actorId: authenticated.actorId, handshake: identity };
}
