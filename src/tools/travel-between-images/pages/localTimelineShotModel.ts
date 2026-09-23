import type { AssetRegistry, AssetRegistryEntry } from '@/tools/video-editor/types/index.ts';
import { bridgeMediaUrl } from '@/shared/lib/media/bridgeMediaUrl.ts';
import type { GenerationRow, Shot } from '@/domains/generation/types';
import { TOOL_IDS } from '@/shared/lib/tooling/toolIds';
import type { CanonicalShotOccurrence, PreparedShotComposition } from '@/tools/video-editor/data/shotCompositionAdapter.ts';

export type LocalTimelineShotClip = {
  clipId: string;
  clip: Record<string, unknown>;
  durationSeconds: number;
  startSeconds: number;
  relativeStartSeconds: number;
  lane: number;
  asset: AssetRegistryEntry | undefined;
  thumbnailUrl: string | undefined;
  missingAsset: boolean;
};

export type LocalTimelineShot = {
  id: string;
  occurrenceId: string;
  shotId: string;
  revisionId: string;
  parentDocumentId: string;
  stableDeepLink: string;
  outputIdentity: string;
  name: string;
  trackId: string;
  clips: LocalTimelineShotClip[];
  nonVisualClipCount: number;
  missingClipCount: number;
  durationSeconds: number;
  laneCount: number;
  timing: JsonObject;
  audio: JsonObject;
  generationInputs: readonly JsonObject[];
  assets: readonly JsonObject[];
  dependencies: readonly JsonObject[];
  provenance: JsonObject;
  settings: JsonObject;
};

/** The legacy editor view model, carrying canonical identity as metadata. */
export type LocalTimelineShotModel = Shot & {
  occurrenceId: string;
  shotId: string;
  revisionId: string;
  parentDocumentId: string;
  stableDeepLink: string;
  outputIdentity: string;
  images: GenerationRow[];
  timing: JsonObject;
  audio: JsonObject;
  generationInputs: readonly JsonObject[];
  assets: readonly JsonObject[];
  dependencies: readonly JsonObject[];
  provenance: JsonObject;
};

type JsonObject = Record<string, unknown>;
const isRecord = (value: unknown): value is JsonObject => value !== null && typeof value === 'object' && !Array.isArray(value);
const positiveNumber = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
const finiteNumber = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const stringValue = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value : undefined;

function assetReference(asset: AssetRegistryEntry | undefined): string | undefined {
  if (!asset) return undefined;
  const candidate = asset as AssetRegistryEntry & { src?: string; url?: string; file?: string };
  return stringValue(candidate.thumbnailUrl) ?? stringValue(candidate.src) ?? stringValue(candidate.url) ?? stringValue(candidate.file) ?? stringValue(candidate.media_id);
}

function displayReference(asset: AssetRegistryEntry | undefined): string | undefined {
  if (!asset) return undefined;
  const candidate = asset as AssetRegistryEntry & { src?: string; url?: string; file?: string };
  return stringValue(candidate.src) ?? stringValue(candidate.url) ?? stringValue(candidate.file) ?? stringValue(candidate.media_id);
}

function revisionTimeline(revision: JsonObject): JsonObject {
  const internal = isRecord(revision.internal_timeline_revision) ? revision.internal_timeline_revision : {};
  return isRecord(internal.timeline) ? internal.timeline : {};
}

function revisionAssets(revision: JsonObject): Map<string, string> {
  const assets = Array.isArray(revision.assets) ? revision.assets : [];
  return new Map(assets.flatMap((rawAsset) => {
    if (!isRecord(rawAsset)) return [];
    const assetId = stringValue(rawAsset.asset_id);
    const objectId = stringValue(rawAsset.object_id);
    return assetId && objectId ? [[assetId, objectId] as const] : [];
  }));
}

function assetIdObjects(assetId: string | undefined, assets: Map<string, string>): string | undefined {
  if (!assetId) return undefined;
  return assets.get(assetId) ?? (/^(?:sha256:)?[0-9a-f]{64}$/.test(assetId) ? assetId : undefined);
}

function registryAsset(registry: AssetRegistry | null | undefined, assetId: string | undefined, objectId: string | undefined): AssetRegistryEntry | undefined {
  const assets = registry?.assets ?? {};
  if (assetId && assets[assetId]) return assets[assetId];
  if (objectId && assets[objectId]) return assets[objectId];
  return Object.values(assets).find((entry) => entry.media_id === objectId);
}

function clipStartSeconds(clip: JsonObject): number {
  const atMs = finiteNumber(clip.at_ms);
  if (atMs !== undefined) return Math.max(0, atMs) / 1000;
  return Math.max(0, finiteNumber(clip.at) ?? 0);
}

function clipDurationSeconds(clip: JsonObject): number {
  const durationMs = positiveNumber(clip.duration_ms);
  if (durationMs !== undefined) return durationMs / 1000;
  const duration = positiveNumber(clip.duration);
  if (duration !== undefined) return duration;
  const hold = positiveNumber(clip.hold);
  if (hold !== undefined) return hold;
  const from = finiteNumber(clip.from);
  const to = finiteNumber(clip.to);
  if (from !== undefined && to !== undefined && to > from) return to - from;
  const at = finiteNumber(clip.at);
  if (at !== undefined && to !== undefined && to > at) return to - at;
  return 0;
}

function shotName(occurrence: CanonicalShotOccurrence): string {
  const provenance = isRecord(occurrence.revision.provenance) ? occurrence.revision.provenance : {};
  return stringValue(provenance.name) ?? stringValue(provenance.title) ?? occurrence.shotId;
}

function toOccurrenceShot(occurrence: CanonicalShotOccurrence, registry: AssetRegistry | null | undefined, projectSlug?: string): LocalTimelineShot {
  const revision = occurrence.revision;
  const timeline = revisionTimeline(occurrence.revision);
  const assetObjects = revisionAssets(occurrence.revision);
  const rawClips = Array.isArray(timeline.clips) ? timeline.clips : [];
  const clips = rawClips.flatMap((rawClip, clipIndex) => {
    if (!isRecord(rawClip)) return [];
    const clipId = stringValue(rawClip.id) ?? `${occurrence.occurrenceId}-clip-${clipIndex}`;
    // Runtime canonical revisions may expose the same selected asset in the
    // transport form (`asset_id`) or the editor form (`asset`).  Both are
    // authored fields of the one internal timeline; treating only the former
    // as media makes the nested shot editor falsely report no images while
    // the parent compositor still renders the clip.
    const assetId = stringValue(rawClip.asset_id) ?? stringValue(rawClip.asset);
    const objectId = assetIdObjects(assetId, assetObjects);
    const canonicalAsset = Array.isArray(revision.assets)
      ? revision.assets.find((rawAsset) => {
        if (!isRecord(rawAsset)) return false;
        return rawAsset.asset_id === assetId || rawAsset.object_id === assetId || rawAsset.media_id === assetId;
      })
      : undefined;
    const canonicalAssetEntry = isRecord(canonicalAsset) && stringValue(canonicalAsset.object_id)
      ? {
        media_id: canonicalAsset.object_id,
        type: stringValue(canonicalAsset.media_type) ?? 'image',
        file: canonicalAsset.object_id,
      } as AssetRegistryEntry
      : undefined;
    const asset = registryAsset(registry, assetId, objectId) ?? canonicalAssetEntry;
    const thumb = assetReference(asset);
    return [{
      clipId,
      clip: rawClip,
      durationSeconds: clipDurationSeconds(rawClip),
      startSeconds: clipStartSeconds(rawClip),
      relativeStartSeconds: 0,
      lane: 0,
      asset,
      thumbnailUrl: thumb ? bridgeMediaUrl(projectSlug, thumb) : undefined,
      missingAsset: Boolean(assetId && !asset),
    } satisfies LocalTimelineShotClip];
  }).sort((left, right) => left.startSeconds - right.startSeconds);

  const timelineStart = clips.length > 0 ? Math.min(...clips.map((clip) => clip.startSeconds)) : 0;
  const laneEnds: number[] = [];
  clips.forEach((clip) => {
    clip.relativeStartSeconds = Math.max(0, clip.startSeconds - timelineStart);
    const end = clip.relativeStartSeconds + clip.durationSeconds;
    const availableLane = laneEnds.findIndex((laneEnd) => laneEnd <= clip.relativeStartSeconds);
    clip.lane = availableLane >= 0 ? availableLane : laneEnds.length;
    laneEnds[clip.lane] = end;
  });

  const timelineTracks = Array.isArray(timeline.tracks) ? timeline.tracks : [];
  const firstTrack = timelineTracks[0];
  return {
    id: occurrence.occurrenceId,
    occurrenceId: occurrence.occurrenceId,
    shotId: occurrence.shotId,
    revisionId: occurrence.revisionId,
    parentDocumentId: occurrence.parentDocumentId,
    stableDeepLink: occurrence.stableDeepLink,
    outputIdentity: occurrence.outputIdentity,
    name: shotName(occurrence),
    trackId: isRecord(firstTrack) ? stringValue(firstTrack.id) ?? 'video' : 'video',
    clips,
    nonVisualClipCount: 0,
    missingClipCount: 0,
    durationSeconds: clips.reduce((latest, clip) => Math.max(latest, clip.relativeStartSeconds + clip.durationSeconds), 0),
    laneCount: Math.max(1, laneEnds.length),
    timing: isRecord(revision.timing) ? revision.timing : {},
    audio: isRecord(revision.audio) ? revision.audio : {},
    generationInputs: Array.isArray(revision.generation_inputs) ? revision.generation_inputs.filter(isRecord) : [],
    assets: Array.isArray(revision.assets) ? revision.assets.filter(isRecord) : [],
    dependencies: Array.isArray(revision.dependencies) ? revision.dependencies.filter(isRecord) : [],
    provenance: isRecord(revision.provenance) ? revision.provenance : {},
    settings: isRecord(revision.settings) ? revision.settings : {},
  };
}

export function selectCanonicalShotOccurrences(composition: PreparedShotComposition | null | undefined, registry: AssetRegistry | null | undefined = undefined, projectSlug?: string): LocalTimelineShot[] {
  return composition?.occurrences.map((occurrence) => toOccurrenceShot(occurrence, registry, projectSlug)) ?? [];
}

export function toCanonicalShotModel(shot: LocalTimelineShot, fps = 30, projectSlug?: string): LocalTimelineShotModel {
  const images = shot.clips.flatMap((item, index) => {
    const locationReference = displayReference(item.asset);
    if (!locationReference) return [];
    const location = bridgeMediaUrl(projectSlug, locationReference);
    const generationId = item.asset?.generationId ?? item.asset?.variantId ?? item.asset?.media_id ?? item.clipId;
    return [{
      id: `${shot.occurrenceId}:${item.clipId}`,
      shot_generation_id: `${shot.occurrenceId}:${item.clipId}`,
      generation_id: generationId,
      location,
      imageUrl: location,
      thumbUrl: item.thumbnailUrl ?? location,
      type: item.asset?.type ?? 'image',
      createdAt: new Date(index).toISOString(),
      name: stringValue(item.clip.label) ?? item.clipId,
      timeline_frame: Math.max(0, Math.round(item.startSeconds * fps)),
      metadata: {
        source: 'canonical-shot-composition',
        projectSlug,
        shotId: shot.shotId,
        revisionId: shot.revisionId,
        occurrenceId: shot.occurrenceId,
        stableDeepLink: shot.stableDeepLink,
        outputIdentity: shot.outputIdentity,
        clipId: item.clipId,
      },
    } satisfies GenerationRow];
  });

  return {
    id: shot.occurrenceId,
    name: shot.name,
    created_at: '1970-01-01T00:00:00.000Z',
    updated_at: null,
    project_id: projectSlug,
    aspect_ratio: null,
    position: 0,
    settings: {
      ...(Object.keys(shot.settings).length > 0
        ? { [TOOL_IDS.TRAVEL_BETWEEN_IMAGES]: shot.settings }
        : {}),
    },
    occurrenceId: shot.occurrenceId,
    shotId: shot.shotId,
    revisionId: shot.revisionId,
    parentDocumentId: shot.parentDocumentId,
    stableDeepLink: shot.stableDeepLink,
    outputIdentity: shot.outputIdentity,
    timing: shot.timing,
    audio: shot.audio,
    generationInputs: shot.generationInputs,
    assets: shot.assets,
    dependencies: shot.dependencies,
    provenance: shot.provenance,
    images,
    imageCount: images.length,
    positionedImageCount: images.length,
    unpositionedImageCount: 0,
    hasUnpositionedImages: false,
  };
}

export function selectCanonicalShotModels(composition: PreparedShotComposition | null | undefined, registry: AssetRegistry | null | undefined, projectSlug?: string): LocalTimelineShotModel[] {
  return selectCanonicalShotOccurrences(composition, registry, projectSlug).map((shot) => toCanonicalShotModel(shot, 30, projectSlug));
}
