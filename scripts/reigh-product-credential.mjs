import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

export const PRODUCT_SCOPES = Object.freeze([
  'handshake', 'projects:read', 'projects:write', 'tasks:read', 'tasks:write',
  'objects:read', 'objects:write',
]);

function fail(message) {
  throw new Error(`product credential: ${message}`);
}

function parseJson(raw, label) {
  try { return JSON.parse(raw); }
  catch { return fail(`${label} JSON is malformed`); }
}

function exactActorForToken(token) {
  return `astrid-${createHash('sha256').update(token).digest('hex').slice(0, 24)}`;
}

function checkOverride(actorId, expectedActor) {
  if (expectedActor && expectedActor !== actorId) {
    fail('explicit REIGH_PAIRED_PRODUCT_ACTOR does not match the authenticated product actor');
  }
}

/**
 * Read the authenticated Astrid product credential published by Runtime
 * bootstrap. Raw token overrides remain supported only with an explicit actor
 * or compatible product metadata; Runtime's handshake is the scope authority.
 */
export function readProductCredential(credentialPath, expectedActor = '') {
  let raw;
  try { raw = readFileSync(credentialPath, 'utf8').trim(); }
  catch (error) { return fail(`cannot read ${credentialPath}: ${error instanceof Error ? error.message : String(error)}`); }
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
    checkOverride(value.actor_id, expectedActor);
    return { token: value.token, actorId: value.actor_id, source: 'runtime-bootstrap' };
  }

  const metadataName = basename(credentialPath).replace(/\.token$/, '') || 'product';
  const metadataPath = resolve(dirname(credentialPath), `${metadataName}.json`);
  if (existsSync(metadataPath)) {
    const metadata = parseJson(readFileSync(metadataPath, 'utf8'), 'credential metadata');
    const scopes = Array.isArray(metadata?.scopes)
      ? metadata.scopes.filter((value) => typeof value === 'string') : [];
    if (
      typeof metadata?.actor !== 'string'
      || metadata.actor === 'owner'
      || metadata.actor === 'astrid-pack-host'
      || scopes.includes('admin')
      || !PRODUCT_SCOPES.every((scope) => scopes.includes(scope))
    ) return fail('owner, admin, Worker, or insufficient-scope metadata is forbidden');
    checkOverride(metadata.actor, expectedActor);
    return { token: raw, actorId: metadata.actor, source: 'explicit-token-metadata' };
  }

  if (!expectedActor) return fail('raw token requires REIGH_PAIRED_PRODUCT_ACTOR');
  return { token: raw, actorId: expectedActor, source: 'explicit-token-override' };
}
