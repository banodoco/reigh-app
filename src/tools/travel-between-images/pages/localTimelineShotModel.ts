import type { AssetRegistry, AssetRegistryEntry } from '@/tools/video-editor/types/index.ts';
import { bridgeMediaUrl } from '@/shared/lib/media/bridgeMediaUrl.ts';
import type { GenerationRow, Shot } from '@/domains/generation/types';
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
};

type JsonObject = Record<string, unknown>;
const isRecord = (value: unknown): value is JsonObject => value !== null && typeof value === 'object' && !Array.isArray(value);
const positiveNumber = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
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

function registryAsset(registry: AssetRegistry | null | undefined, assetId: string | undefined, objectId: string | undefined): AssetRegistryEntry | undefined {
  const assets = registry?.assets ?? {};
  if (assetId && assets[assetId]) return assets[assetId];
  if (objectId && assets[objectId]) return assets[objectId];
  return Object.values(assets).find((entry) => entry.media_id === objectId);
}

function shotName(occurrence: CanonicalShotOccurrence): string {
  const provenance = isRecord(occurrence.revision.provenance) ? occurrence.revision.provenance : {};
  return stringValue(provenance.name) ?? stringValue(provenance.title) ?? occurrence.shotId;
}

function toOccurrenceShot(occurrence: CanonicalShotOccurrence, registry: AssetRegistry | null | undefined, projectSlug?: string): LocalTimelineShot {
  const timeline = revisionTimeline(occurrence.revision);
  const assetObjects = revisionAssets(occurrence.revision);
  const rawClips = Array.isArray(timeline.clips) ? timeline.clips : [];
  const clips = rawClips.flatMap((rawClip, clipIndex) => {
    if (!isRecord(rawClip)) return [];
    const clipId = stringValue(rawClip.id) ?? `${occurrence.occurrenceId}-clip-${clipIndex}`;
    const assetId = stringValue(rawClip.asset_id);
    const objectId = assetId ? assetObjects.get(assetId) : undefined;
    const asset = registryAsset(registry, assetId, objectId);
    const thumb = assetReference(asset);
    return [{
      clipId,
      clip: rawClip,
      durationSeconds: (positiveNumber(rawClip.duration_ms) ?? 0) / 1000,
      startSeconds: (positiveNumber(rawClip.at_ms) ?? 0) / 1000,
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
    settings: {},
    occurrenceId: shot.occurrenceId,
    shotId: shot.shotId,
    revisionId: shot.revisionId,
    parentDocumentId: shot.parentDocumentId,
    stableDeepLink: shot.stableDeepLink,
    outputIdentity: shot.outputIdentity,
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
