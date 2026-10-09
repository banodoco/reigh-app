import type {
  ResolvedTimelineClip,
  ResolvedTimelineConfig,
  TimelineClip,
  TrackDefinition,
  TrackRole,
} from '@/tools/video-editor/types/index.ts';

type JsonObject = Record<string, unknown>;

export class InvalidTrackRoleError extends Error {
  readonly code = 'invalid_track_role' as const;
  readonly trackId?: string;

  constructor(role: unknown, trackId?: string) {
    super(`Track${trackId ? ` ${trackId}` : ''} has invalid role ${JSON.stringify(role)}; expected "output" or "source"`);
    this.name = 'InvalidTrackRoleError';
    this.trackId = trackId;
  }
}

/** Omitted role is deliberately output for legacy documents. */
export function trackRole(track: Pick<TrackDefinition, 'role'> & { id?: string }): TrackRole {
  if (track.role === undefined) return 'output';
  if (track.role === 'output' || track.role === 'source') return track.role;
  throw new InvalidTrackRoleError(track.role, track.id);
}

export function isOutputTrack(track: Pick<TrackDefinition, 'role'> & { id?: string }): boolean {
  return trackRole(track) === 'output';
}

function isJsonObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function rawTrackRole(track: JsonObject): TrackRole {
  const role = track.role;
  if (role === undefined) return 'output';
  if (role === 'output' || role === 'source') return role;
  throw new InvalidTrackRoleError(role, typeof track.id === 'string' ? track.id : undefined);
}

/**
 * Filter one authored timeline before any child assets, automation, effects or
 * timing are inspected. Unknown track IDs retain legacy output behavior; a
 * missing track cannot be classified as a source lane.
 */
export function outputTrackIds(timeline: unknown): ReadonlySet<string> {
  if (!isJsonObject(timeline) || !Array.isArray(timeline.tracks)) return new Set();
  const ids = new Set<string>();
  for (const rawTrack of timeline.tracks) {
    if (!isJsonObject(rawTrack) || typeof rawTrack.id !== 'string') continue;
    if (rawTrackRole(rawTrack) === 'output') ids.add(rawTrack.id);
  }
  return ids;
}

export function outputTimeline(timeline: unknown): JsonObject {
  if (!isJsonObject(timeline)) return {};
  const sourceTrackIds = new Set<string>();
  if (Array.isArray(timeline.tracks)) {
    for (const rawTrack of timeline.tracks) {
      if (!isJsonObject(rawTrack) || typeof rawTrack.id !== 'string') continue;
      if (rawTrackRole(rawTrack) === 'source') sourceTrackIds.add(rawTrack.id);
    }
  }
  if (!Array.isArray(timeline.clips)) return { ...timeline };
  return {
    ...timeline,
    clips: timeline.clips.filter((rawClip) => (
      !isJsonObject(rawClip)
      || typeof rawClip.track !== 'string'
      || !sourceTrackIds.has(rawClip.track)
    )),
  };
}

export type OutputTimelineProjection = Readonly<{
  config: ResolvedTimelineConfig;
  excludedClipIds: readonly string[];
  hasOutputContent: boolean;
}>;

/**
 * Non-mutating output view used by browser rendering and managed payload
 * construction. Authored tracks remain present for inspection, but source
 * clips never reach render/timing/automation consumers.
 */
export function projectOutputTimelineConfig(
  config: ResolvedTimelineConfig,
): OutputTimelineProjection {
  const tracks = Array.isArray(config.tracks) ? config.tracks : [];
  const sourceTrackIds = new Set<string>();
  for (const track of tracks) {
    if (trackRole(track) === 'source') sourceTrackIds.add(track.id);
  }
  const excludedClipIds: string[] = [];
  const clips: ResolvedTimelineClip[] = [];
  const sourceAssetIds = new Set<string>();
  const outputAssetIds = new Set<string>();
  for (const clip of config.clips) {
    if (sourceTrackIds.has(clip.track)) {
      excludedClipIds.push(clip.id);
      if (typeof clip.asset === 'string' && clip.asset.length > 0) sourceAssetIds.add(clip.asset);
      continue;
    }
    clips.push(clip);
    if (typeof clip.asset === 'string' && clip.asset.length > 0) outputAssetIds.add(clip.asset);
  }
  const projectedRegistry = config.registry && typeof config.registry === 'object'
    ? Object.fromEntries(
      Object.entries(config.registry).filter(([assetId]) => !sourceAssetIds.has(assetId) || outputAssetIds.has(assetId)),
    )
    : config.registry;
  return Object.freeze({
    config: {
      ...config,
      // Source lanes are authored state, not render lanes. Dropping them from
      // the projected track table also prevents a local parent/child ID
      // collision from reclassifying an eligible child clip as Source after
      // canonical flattening.
      tracks: tracks.filter((track) => !sourceTrackIds.has(track.id)),
      clips,
      registry: projectedRegistry,
    },
    excludedClipIds: Object.freeze(excludedClipIds),
    hasOutputContent: clips.length > 0,
  });
}

export function outputClipBelongsToTrack(
  clip: Pick<TimelineClip, 'track'>,
  tracks: readonly TrackDefinition[],
): boolean {
  const track = tracks.find((candidate) => candidate.id === clip.track);
  return track ? isOutputTrack(track) : true;
}
