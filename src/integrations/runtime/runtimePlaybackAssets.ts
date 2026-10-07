type RuntimeRecord = Record<string, unknown>;

const digestPattern = /^sha256:[0-9a-f]{64}$/i;

function record(value: unknown): RuntimeRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as RuntimeRecord
    : null;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function canonicalDigest(asset: RuntimeRecord, objectId: string, label: string): string {
  const digest = [asset.digest, asset.content_sha256, asset.sha256, objectId]
    .find((value): value is string => typeof value === 'string' && value.length > 0);
  if (!digest) throw new Error(`Workspace Runtime ${label} has no immutable asset digest`);
  if (digestPattern.test(digest)) return digest.toLowerCase();
  if (/^[0-9a-f]{64}$/i.test(digest)) return `sha256:${digest.toLowerCase()}`;
  throw new Error(`Workspace Runtime ${label} has an invalid immutable asset digest`);
}

function canonicalRole(asset: RuntimeRecord, fallback?: string): string {
  const source = record(asset.source);
  return [asset.role, asset.media_type, asset.type, source?.media_type, source?.type]
    .find((value): value is string => typeof value === 'string' && value.length > 0)
    ?? fallback ?? 'source';
}

/** Build a playback-only view; the exact Runtime payload stays publishable. */
export function normalizeShotRevisionAssets(
  projectId: string,
  shotId: string,
  revisionId: string,
  shotPayload: RuntimeRecord,
  timelinePayload: RuntimeRecord,
): RuntimeRecord[] {
  const assets = new Map<string, RuntimeRecord>();
  const selected = new Set(list(timelinePayload.clips).flatMap((rawClip) => {
    const clip = record(rawClip);
    const id = typeof clip?.asset_id === 'string' ? clip.asset_id : clip?.asset;
    return typeof id === 'string' && id.length > 0 ? [id] : [];
  }));
  const add = (id: string, raw: RuntimeRecord, origin: string, authoritative = false): void => {
    const objectId = typeof raw.object_id === 'string' && raw.object_id.length > 0
      ? raw.object_id
      : typeof raw.media_id === 'string' && raw.media_id.length > 0 ? raw.media_id : undefined;
    if (!objectId) {
      if (authoritative && selected.has(id)) {
        throw new Error(`Workspace Runtime ${origin} ${shotId}/${revisionId} selected asset ${id} has no immutable object identity`);
      }
      return;
    }
    const label = `${origin} ${shotId}/${revisionId} asset ${id}`;
    const previous = assets.get(id);
    if (previous && previous.object_id !== objectId && !authoritative) {
      throw new Error(`Workspace Runtime ${label} conflicts with object ${String(previous.object_id)}`);
    }
    const normalized = {
      ...raw,
      asset_id: id,
      object_id: objectId,
      digest: canonicalDigest(raw, objectId, label),
      role: canonicalRole(raw, authoritative ? undefined : typeof previous?.role === 'string' ? previous.role : undefined),
      scope: { ...(record(raw.scope) ?? {}), project_id: projectId },
    };
    // The pinned registry is selected-media authority; never merge losing
    // manifest metadata into it.
    assets.set(id, authoritative ? normalized : { ...previous, ...normalized });
  };

  for (const raw of list(shotPayload.assets)) {
    const asset = record(raw);
    if (asset && typeof asset.asset_id === 'string' && asset.asset_id.length > 0) {
      add(asset.asset_id, asset, 'shot revision');
    }
  }
  for (const [id, raw] of Object.entries(record(timelinePayload.assets) ?? {})) {
    const asset = record(raw);
    if (asset) add(id, asset, 'internal timeline');
  }

  const registry = record(record(timelinePayload.registry)?.assets);
  for (const [id, raw] of Object.entries(registry ?? {})) {
    const asset = record(raw);
    if (asset) add(id, asset, 'internal timeline registry', true);
    else if (selected.has(id)) throw new Error(`Workspace Runtime internal timeline registry ${shotId}/${revisionId} selected asset ${id} is malformed`);
  }
  for (const id of selected) {
    if (Object.hasOwn(registry ?? {}, id) && !record(registry?.[id])) {
      throw new Error(`Workspace Runtime internal timeline registry ${shotId}/${revisionId} selected asset ${id} is malformed`);
    }
  }
  return [...assets.values()];
}
