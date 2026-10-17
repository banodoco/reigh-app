import { computeHostFingerprint, HOST_GENERATION_PROVENANCE_VERSION } from '@/sdk/video/timeline/sourceMap.ts';
import type { TimelineConfig } from '@/tools/video-editor/types/index.ts';
import { TRANSCRIPT_SCHEMA_REF } from './adaptTranscript.ts';
import type { SourceFrozenDataItem } from './envelope.ts';

// Compatibility for the persisted DEV transcript-lane format only. This is
// deliberately not a general extension-data migration or a persistence owner.
const EXTENSION_ID = 'haus.astrid.transcript-lane';
const CONTRIBUTION_ID = 'transcript-caption-foundry';
const REVIEW_PREFIX = 'transcript-source-review:';
const CAPTION_TRACK_ID = 'transcript-caption-foundry-track';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const prefixes = (assetId: string, sourceId: string) => ({
  legacy: `transcript-source:${encodeURIComponent(sourceId)}:segment:`,
  canonical: `transcript-source:${encodeURIComponent(assetId)}:source:${encodeURIComponent(sourceId)}:segment:`,
});

export interface TranscriptIdentityMapping {
  readonly segments: ReadonlyMap<string, string>;
  readonly words: ReadonlyMap<string, string>;
}

/** Match logical IDs, never array positions, content, or a different source. */
export function mapReplacedTranscriptIdentities(
  previous: readonly SourceFrozenDataItem[],
  incoming: readonly SourceFrozenDataItem[],
  assetId: string,
  sourceId: string,
): TranscriptIdentityMapping {
  const scope = prefixes(assetId, sourceId);
  const belongs = (item: SourceFrozenDataItem) => item.schemaRef === TRANSCRIPT_SCHEMA_REF
    && item.sourceArtifactRef.assetId === assetId
    && isRecord(item.payload) && item.payload.sourceId === sourceId;
  const previousById = new Map(previous.filter(belongs).map((item) => [item.id, item]));
  const segments = new Map<string, string>();
  const words = new Map<string, string>();
  for (const item of incoming.filter(belongs)) {
    if (!item.id.startsWith(scope.canonical)) continue; // Omitted-source IDs stay unchanged.
    const legacyId = scope.legacy + item.id.slice(scope.canonical.length);
    const old = previousById.get(legacyId);
    if (!old || old.id === item.id) continue;
    segments.set(old.id, item.id);
    if (!isRecord(old.payload) || !isRecord(item.payload)
      || !Array.isArray(old.payload.words) || !Array.isArray(item.payload.words)) continue;
    const oldWords = new Set(old.payload.words.filter(isRecord).map((word) => word.id));
    for (const word of item.payload.words.filter(isRecord)) {
      if (typeof word.id !== 'string' || !word.id.startsWith(`${item.id}:word:`)) continue;
      const legacyWordId = old.id + word.id.slice(item.id.length);
      if (oldWords.has(legacyWordId)) words.set(legacyWordId, word.id);
    }
  }
  return { segments, words };
}

const captionId = (occurrenceId: string) =>
  `transcript-caption-${computeHostFingerprint(occurrenceId).split(':')[1]}`;

/**
 * Reconcile known durable references before the import's single commitData.
 * Historical fingerprints/acknowledgements remain the original evidence;
 * text, style, timing, review status, and unrelated extension data are retained.
 */
export function reconcileTranscriptReferences(
  config: TimelineConfig,
  allPrevious: readonly SourceFrozenDataItem[],
  incoming: readonly SourceFrozenDataItem[],
  assetId: string,
  sourceId: string,
): TimelineConfig {
  const { segments } = mapReplacedTranscriptIdentities(allPrevious, incoming, assetId, sourceId);
  if (segments.size === 0) return config;

  // Include aliases of already upgraded assets. Otherwise importing A then B
  // could make an unresolved shared legacy review appear to belong only to B.
  const owners = new Map<string, Set<string>>();
  for (const item of allPrevious) {
    if (item.schemaRef !== TRANSCRIPT_SCHEMA_REF || !isRecord(item.payload)
      || typeof item.payload.sourceId !== 'string') continue;
    const owner = JSON.stringify([item.sourceArtifactRef.assetId, item.payload.sourceId]);
    const scope = prefixes(item.sourceArtifactRef.assetId, item.payload.sourceId);
    const aliases = [item.id];
    if (item.id.startsWith(scope.canonical)) aliases.push(scope.legacy + item.id.slice(scope.canonical.length));
    for (const alias of aliases) {
      const set = owners.get(alias) ?? new Set<string>();
      set.add(owner);
      owners.set(alias, set);
    }
  }

  const occupiedClipIds = new Set(config.clips.map((clip) => clip.id));
  let clipsChanged = false;
  const clips = config.clips.map((clip) => {
    const meta = clip.app?.__generated__;
    if (clip.track !== CAPTION_TRACK_ID || !isRecord(meta)
      || meta.extensionId !== EXTENSION_ID || meta.contributionId !== CONTRIBUTION_ID
      || !isRecord(meta.provenance) || meta.provenance.sourceSchemaRef !== TRANSCRIPT_SCHEMA_REF
      || meta.provenance.contractVersion !== HOST_GENERATION_PROVENANCE_VERSION
      || typeof meta.provenance.sourceItemId !== 'string') return clip;
    const oldId = meta.provenance.sourceItemId;
    const newId = segments.get(oldId);
    if (!newId) return clip;
    // The occurrence's media clip proves ownership even if the old source ID
    // was shared. Asset-level IDs require an unambiguous source inventory.
    const suffixes = config.clips.filter((media) => media.asset === assetId)
      .flatMap((media) => [`@${media.id}`, `@${encodeURIComponent(media.id)}`]);
    if (owners.get(oldId)?.size === 1) suffixes.push('', '@source', '@timeline');
    const suffix = suffixes.find((candidate) => captionId(oldId + candidate) === clip.id);
    if (suffix === undefined) return clip;
    const id = captionId(newId + suffix);
    // Never overwrite either output when legacy and canonical clips coexist.
    if (occupiedClipIds.has(id)) return clip;
    occupiedClipIds.add(id);
    clipsChanged = true;
    return {
      ...clip, id,
      app: { ...clip.app, __generated__: {
        ...meta, provenance: { ...meta.provenance, sourceItemId: newId },
      } },
    };
  });

  const extensionData = config.app?.[EXTENSION_ID];
  let app = config.app;
  if (isRecord(extensionData)) {
    const nextExtensionData = { ...extensionData };
    let reviewsChanged = false;
    for (const [oldId, newId] of segments) {
      // Existing review records have no asset identity. A shared ID cannot
      // prove ownership, even if a caption with that ID can be resolved.
      if (owners.get(oldId)?.size !== 1) continue;
      const key = REVIEW_PREFIX + encodeURIComponent(oldId);
      const nextKey = REVIEW_PREFIX + encodeURIComponent(newId);
      const value = extensionData[key];
      if (!isRecord(value) || value.schemaVersion !== 1
        || value.sourceSchemaRef !== TRANSCRIPT_SCHEMA_REF || value.sourceItemId !== oldId
        || Object.prototype.hasOwnProperty.call(nextExtensionData, nextKey)) continue;
      delete nextExtensionData[key];
      nextExtensionData[nextKey] = { ...value, sourceItemId: newId };
      reviewsChanged = true;
    }
    if (reviewsChanged) app = { ...app, [EXTENSION_ID]: nextExtensionData };
  }
  return clipsChanged || app !== config.app ? { ...config, clips, app } : config;
}
