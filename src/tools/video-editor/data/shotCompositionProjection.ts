import { bridgeMediaUrl } from '@/shared/lib/media/bridgeMediaUrl.ts';
import type {
  ResolvedAssetRegistryEntry,
  ResolvedTimelineConfig,
  TimelineClip,
  TrackDefinition,
} from '@/tools/video-editor/types/index.ts';
import type {
  CanonicalShotOccurrence,
  PreparedShotComposition,
} from './shotCompositionAdapter.ts';

type JsonObject = Record<string, unknown>;

export type CanonicalProjectionFailureCode =
  | 'missing_dependency'
  | 'unsupported_nesting'
  | 'blank_child_output';

export class CanonicalCompositionProjectionError extends Error {
  readonly code: CanonicalProjectionFailureCode;
  readonly occurrenceId?: string;

  constructor(code: CanonicalProjectionFailureCode, message: string, occurrenceId?: string) {
    super(message);
    this.name = 'CanonicalCompositionProjectionError';
    this.code = code;
    this.occurrenceId = occurrenceId;
  }
}

export type CanonicalClipIdentity = Readonly<{
  projectId: string;
  parentDocumentId: string;
  occurrenceId: string;
  shotId: string;
  revisionId: string;
  internalTimelineRevisionId: string;
  outputIdentity: string;
}>;

export type CanonicalCompositionProjection = Readonly<{
  config: ResolvedTimelineConfig;
  clipIdentities: ReadonlyMap<string, CanonicalClipIdentity>;
  occurrenceIdentities: ReadonlyMap<string, CanonicalClipIdentity>;
}>;

function record(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function positiveNumber(value: unknown, fallback: number): number {
  const candidate = finiteNumber(value, fallback);
  return candidate > 0 ? candidate : fallback;
}

function internalTimelineRevisionId(occurrence: CanonicalShotOccurrence): string {
  const internal = record(occurrence.revision.internal_timeline_revision);
  return text(internal?.revision_id) ?? `${occurrence.revisionId}:internal`;
}

function identityForOccurrence(occurrence: CanonicalShotOccurrence): CanonicalClipIdentity {
  return Object.freeze({
    projectId: occurrence.projectId,
    parentDocumentId: occurrence.parentDocumentId,
    occurrenceId: occurrence.occurrenceId,
    shotId: occurrence.shotId,
    revisionId: occurrence.revisionId,
    internalTimelineRevisionId: internalTimelineRevisionId(occurrence),
    outputIdentity: occurrence.outputIdentity,
  });
}

function assertDependencies(composition: PreparedShotComposition): void {
  const revisions = new Set(composition.contract.shot_revisions.map((revision) => (
    `${String(revision.shot_id)}\u0000${String(revision.revision_id)}`
  )));
  for (const revision of composition.contract.shot_revisions) {
    const dependencies = Array.isArray(revision.dependencies) ? revision.dependencies : [];
    for (const dependency of dependencies) {
      const value = record(dependency);
      const key = `${String(value?.shot_id)}\u0000${String(value?.revision_id)}`;
      if (!revisions.has(key)) {
        throw new CanonicalCompositionProjectionError(
          'missing_dependency',
          `Canonical shot ${String(revision.shot_id)}/${String(revision.revision_id)} requires missing dependency ${key.replace('\u0000', '/')}`,
        );
      }
    }
  }
}

function assertSupportedChildClip(rawClip: JsonObject, occurrence: CanonicalShotOccurrence): void {
  const clipType = text(rawClip.clip_type) ?? text(rawClip.clipType);
  const nested = clipType === 'shot'
    || clipType === 'sequence'
    || clipType === 'composition'
    || Array.isArray(rawClip.children)
    || rawClip.shot_id !== undefined
    || rawClip.shot_revision_id !== undefined
    || rawClip.occurrence_id !== undefined;
  if (nested) {
    throw new CanonicalCompositionProjectionError(
      'unsupported_nesting',
      `Canonical occurrence ${occurrence.occurrenceId} contains an unsupported nested child clip`,
      occurrence.occurrenceId,
    );
  }
}

function childTimeline(occurrence: CanonicalShotOccurrence): JsonObject {
  const internal = record(occurrence.revision.internal_timeline_revision);
  const timeline = record(internal?.timeline);
  if (!timeline) {
    throw new CanonicalCompositionProjectionError(
      'blank_child_output',
      `Canonical occurrence ${occurrence.occurrenceId} has no child timeline`,
      occurrence.occurrenceId,
    );
  }
  return timeline;
}

function assetRegistryFor(
  composition: PreparedShotComposition,
  baseConfig?: ResolvedTimelineConfig | null,
): Record<string, ResolvedAssetRegistryEntry> {
  const registry: Record<string, ResolvedAssetRegistryEntry> = {
    ...(baseConfig?.registry ?? {}),
  };
  for (const occurrence of composition.occurrences) {
    const assets = Array.isArray(occurrence.revision.assets) ? occurrence.revision.assets : [];
    for (const rawAsset of assets) {
      const asset = record(rawAsset);
      const assetId = text(asset?.asset_id);
      const objectId = text(asset?.object_id);
      if (!assetId || !objectId || registry[assetId]) continue;
      const mediaType = text(asset?.media_type) ?? 'image';
      registry[assetId] = {
        file: objectId,
        media_id: objectId,
        content_sha256: text(asset?.digest),
        type: mediaType,
        origin: 'immutable-public',
        metadata: {
          provenance: {
            sourceProvider: 'canonical-shot-composition',
            originalFilename: assetId,
          },
        },
        src: bridgeMediaUrl(composition.projectId, objectId),
      };
    }
  }
  return registry;
}

function tracksFor(
  composition: PreparedShotComposition,
  baseConfig?: ResolvedTimelineConfig | null,
): TrackDefinition[] {
  // Keep parent-owned lanes (frame overlays, FX, terminal activity, VO, etc.)
  // alongside the projected shot child lanes. The canonical graph owns shot
  // content, but it does not replace unrelated parent timeline content.
  const tracks = new Map<string, TrackDefinition>(
    (baseConfig?.tracks ?? []).map((track) => [track.id, track]),
  );
  for (const occurrence of composition.occurrences) {
    const timeline = childTimeline(occurrence);
    const rawTracks = Array.isArray(timeline.tracks) ? timeline.tracks : [];
    for (const rawTrack of rawTracks) {
      const track = record(rawTrack);
      const id = text(track?.id);
      if (!id || tracks.has(id)) continue;
      const kind = track?.kind === 'audio' ? 'audio' : 'visual';
      tracks.set(id, {
        id,
        kind,
        label: text(track?.label) ?? id,
        ...(typeof track?.muted === 'boolean' ? { muted: track.muted } : {}),
        ...(typeof track?.volume === 'number' ? { volume: track.volume } : {}),
      });
    }
  }
  if (tracks.size === 0) {
    tracks.set('video', { id: 'video', kind: 'visual', label: 'Video' });
  }
  return [...tracks.values()];
}

function projectClip(
  rawClip: JsonObject,
  occurrence: CanonicalShotOccurrence,
  clipIndex: number,
  clipIdentities: Map<string, CanonicalClipIdentity>,
): TimelineClip {
  assertSupportedChildClip(rawClip, occurrence);
  const identity = identityForOccurrence(occurrence);
  const clipId = text(rawClip.id) ?? `child-${clipIndex}`;
  const id = `${occurrence.occurrenceId}:${clipId}`;
  const atMs = Math.max(0, finiteNumber(rawClip.at_ms ?? rawClip.at, 0));
  const durationMs = Math.max(1, finiteNumber(rawClip.duration_ms ?? rawClip.duration, occurrence.durationMs));
  const sourceOffsetMs = Math.max(0, occurrence.sourceOffsetMs ?? 0);
  const speed = positiveNumber(rawClip.speed, positiveNumber(occurrence.speed, 1));
  const gain = finiteNumber(rawClip.gain ?? rawClip.volume, occurrence.gain ?? 1);
  const muted = rawClip.muted === true || rawClip.mute === true || occurrence.muted === true;
  const track = text(rawClip.track) ?? occurrence.trackId ?? 'video';
  const clipType = text(rawClip.clip_type) ?? text(rawClip.clipType) ?? 'media';
  const asset = text(rawClip.asset_id) ?? text(rawClip.asset);
  const params = record(rawClip.params);
  const app = record(rawClip.app) ?? {};
  const projected: TimelineClip = {
    id,
    at: Math.max(0, occurrence.atMs + atMs) / 1000,
    track,
    clipType,
    ...(text(rawClip.label) ? { label: text(rawClip.label) } : {}),
    ...(asset ? { asset } : {}),
    ...(sourceOffsetMs > 0 ? { from: sourceOffsetMs / 1000 } : {}),
    ...(speed !== 1 ? { speed } : {}),
    // Canonical child timelines currently expose duration without a media
    // probe. Hold is the deterministic duration-preserving renderer input.
    hold: durationMs / 1000,
    volume: muted ? 0 : gain,
    ...(params ? { params } : {}),
    app: {
      ...app,
      canonical: identity,
      canonicalTiming: {
        sourceOffsetMs,
        speed,
        gain,
        muted,
        durationMs,
      },
    },
  };
  clipIdentities.set(id, identity);
  return projected;
}

export function projectCanonicalComposition(
  composition: PreparedShotComposition,
  baseConfig?: ResolvedTimelineConfig | null,
): CanonicalCompositionProjection {
  assertDependencies(composition);
  const clips: TimelineClip[] = [];
  const clipIdentities = new Map<string, CanonicalClipIdentity>();
  const occurrenceIdentities = new Map<string, CanonicalClipIdentity>();

  for (const occurrence of composition.occurrences) {
    const identity = identityForOccurrence(occurrence);
    occurrenceIdentities.set(occurrence.occurrenceId, identity);
    const timeline = childTimeline(occurrence);
    const rawClips = Array.isArray(timeline.clips) ? timeline.clips : [];
    if (rawClips.length === 0) {
      throw new CanonicalCompositionProjectionError(
        'blank_child_output',
        `Canonical occurrence ${occurrence.occurrenceId} has a blank child output`,
        occurrence.occurrenceId,
      );
    }
    rawClips.forEach((rawClip, index) => {
      const clip = record(rawClip);
      if (clip) clips.push(projectClip(clip, occurrence, index, clipIdentities));
    });
    if (!rawClips.some((rawClip) => record(rawClip))) {
      throw new CanonicalCompositionProjectionError(
        'blank_child_output',
        `Canonical occurrence ${occurrence.occurrenceId} has no renderable child clips`,
        occurrence.occurrenceId,
      );
    }
  }

  // Legacy parent shot clips are replaced by the immutable child projection;
  // every other parent clip remains part of the rendered/editor timeline.
  const parentClips = (baseConfig?.clips ?? []).filter((clip) => clip.clipType !== 'shot');
  const registry = assetRegistryFor(composition, baseConfig);
  // `baseConfig` is already resolved, but projected child clips are created
  // from the persisted canonical graph after that resolution step. Attach the
  // corresponding resolved registry entry here so the renderer can consume
  // the projection directly. Without this, the asset exists in `registry`
  // while `VisualClip` still sees an assetless clip and renders its loud
  // missing-asset placeholder.
  const projectedClips = [...parentClips, ...clips].map((clip) => ({
    ...clip,
    assetEntry: clip.asset ? registry[clip.asset] : undefined,
  }));
  const output = baseConfig?.output ?? { resolution: '1920x1080', fps: 30, file: `timeline-${composition.parentDocumentId}.mp4` };
  const baseApp = record(baseConfig?.app) ?? {};
  const config: ResolvedTimelineConfig = {
    output,
    tracks: tracksFor(composition, baseConfig),
    clips: projectedClips,
    registry,
    ...(baseConfig?.theme ? { theme: baseConfig.theme } : {}),
    ...(baseConfig?.theme_overrides ? { theme_overrides: baseConfig.theme_overrides } : {}),
    ...(baseConfig?.generation_defaults ? { generation_defaults: baseConfig.generation_defaults } : {}),
    app: {
      ...baseApp,
      canonicalComposition: {
        projectId: composition.projectId,
        parentDocumentId: composition.parentDocumentId,
        headRevisionId: composition.headRevisionId,
        occurrenceIds: composition.occurrences.map((occurrence) => occurrence.occurrenceId),
      },
    },
  };

  return Object.freeze({
    config,
    clipIdentities,
    occurrenceIdentities,
  });
}

export function canonicalOccurrenceKey(occurrence: Pick<CanonicalShotOccurrence, 'occurrenceId'>): string {
  return occurrence.occurrenceId;
}

export function managedOutputIdentityForOccurrence(
  output: JsonObject,
): { occurrenceId?: string; outputIdentity?: string } {
  const provenance = record(output.provenance);
  const metadata = record(output.metadata);
  const params = record(output.params);
  const occurrenceId = text(output.occurrence_id)
    ?? text(provenance?.occurrence_id)
    ?? text(metadata?.occurrence_id)
    ?? text(params?.occurrence_id);
  const outputIdentity = text(output.output_identity)
    ?? text(provenance?.output_identity)
    ?? text(metadata?.output_identity)
    ?? text(params?.output_identity);
  return { occurrenceId, outputIdentity };
}

export function managedOutputMatchesOccurrence(
  output: JsonObject,
  occurrence: Pick<CanonicalShotOccurrence, 'occurrenceId' | 'outputIdentity'>,
): boolean {
  const identity = managedOutputIdentityForOccurrence(output);
  return identity.occurrenceId === occurrence.occurrenceId
    || identity.outputIdentity === occurrence.outputIdentity;
}
