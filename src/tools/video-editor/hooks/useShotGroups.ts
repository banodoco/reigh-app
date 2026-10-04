import { useMemo } from 'react';
import { bridgeMediaUrl } from '@/shared/lib/media/bridgeMediaUrl.ts';
import type { TimelineShotGroupView } from '@/tools/video-editor/lib/timeline-domain.ts';
import type { TimelineRow } from '@/tools/video-editor/types/timeline-canvas.ts';
import type { CanonicalShotOccurrence } from '@/tools/video-editor/data/shotCompositionAdapter.ts';
import {
  isActiveTimelineClip,
  timelineOccurrenceContentExtentMs,
  timelineOccurrenceEffectiveDurationMs,
} from '@/tools/video-editor/data/shotCompositionTiming.ts';

const SHOT_COLORS = ['#a855f7', '#ef4444', '#22c55e', '#3b82f6', '#f59e0b', '#14b8a6', '#ec4899', '#84cc16'];

type JsonObject = Record<string, unknown>;

function record(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function mediaType(value: unknown): 'image' | 'video' | 'audio' | undefined {
  const normalized = text(value)?.toLowerCase();
  if (!normalized) return undefined;
  if (normalized === 'image' || normalized.startsWith('image/')) return 'image';
  if (normalized === 'video' || normalized.startsWith('video/')) return 'video';
  if (normalized === 'audio' || normalized.startsWith('audio/')) return 'audio';
  return undefined;
}

function posterObjectId(asset: JsonObject): string | undefined {
  const thumbnail = record(asset.thumbnail);
  const poster = record(asset.poster);
  return text(asset.thumbnail_object_id)
    ?? text(asset.poster_object_id)
    ?? text(asset.thumbnail_id)
    ?? text(thumbnail?.object_id)
    ?? text(thumbnail?.media_id)
    ?? text(poster?.object_id)
    ?? text(poster?.media_id);
}

/**
 * Pick the first authored visual asset for a canonical occurrence. The parent
 * timeline intentionally has no editable child actions for canonical shots,
 * so its ordinary clip thumbnail path cannot see these assets.
 */
export function canonicalShotThumbnailUrl(
  occurrence: CanonicalShotOccurrence,
  sourceFrameThumbnailUrls?: ReadonlyMap<string, string>,
): string | undefined {
  const sourceFrameUrl = sourceFrameThumbnailUrls?.get(occurrence.occurrenceId);
  if (sourceFrameUrl) return sourceFrameUrl;
  const revision = record(occurrence.revision);
  const internal = record(revision?.internal_timeline_revision);
  const timeline = record(internal?.timeline);
  const assets = new Map<string, JsonObject>();
  for (const rawAsset of Array.isArray(revision?.assets) ? revision.assets : []) {
    const asset = record(rawAsset);
    const assetId = text(asset?.asset_id);
    if (asset && assetId) assets.set(assetId, asset);
  }
  for (const rawClip of Array.isArray(timeline?.clips) ? timeline.clips : []) {
    if (!isActiveTimelineClip(rawClip)) continue;
    const clip = record(rawClip);
    if (!clip) continue;
    const asset = assets.get(text(clip.asset_id) ?? text(clip.asset) ?? '');
    if (!asset) continue;
    const kind = mediaType(asset.media_type) ?? mediaType(asset.type) ?? mediaType(clip.clip_type) ?? mediaType(clip.clipType);
    if (kind === 'image') {
      const objectId = text(asset.object_id) ?? text(asset.media_id);
      return objectId ? bridgeMediaUrl(occurrence.projectId, objectId) : undefined;
    }
    if (kind === 'video') {
      const objectId = posterObjectId(asset);
      return objectId ? bridgeMediaUrl(occurrence.projectId, objectId) : undefined;
    }
  }
  return undefined;
}

export interface ShotGroup {
  shotId: string;
  shotName: string;
  rowId: string;
  rowIndex: number;
  start: number;
  end?: number;
  clipIds: string[];
  children: Array<{ clipId: string; offset: number; duration: number }>;
  color: string;
  mode?: 'images' | 'video';
  poolGenerationIds: string[];
  variantIdsByGenerationId: Readonly<Record<string, string>>;
  finalVideoAssetKey?: string;
  derivedFrom?: Readonly<{ shotId: string; trackId: string }>;
  /** Representative visual for canonical groups with no parent clip action. */
  thumbnailSrc?: string;
  canonicalIdentity?: CanonicalShotOccurrence;
}

export function shotGroupEndSeconds(group: Pick<ShotGroup, 'start' | 'end' | 'children'>): number {
  if (typeof group.end === 'number' && Number.isFinite(group.end)) return Math.max(group.start, group.end);
  return group.children.reduce(
    (maximum, child) => Math.max(maximum, group.start + child.offset + child.duration),
    group.start,
  );
}

export function maxShotGroupEndSeconds(groups: readonly ShotGroup[]): number {
  return groups.reduce((maximum, group) => Math.max(maximum, shotGroupEndSeconds(group)), 0);
}

export function shotGroupVideoKey(group: Pick<ShotGroup, 'shotId' | 'canonicalIdentity'>): string {
  return group.canonicalIdentity?.occurrenceId ?? group.shotId;
}

/**
 * Project canonical shot geometry onto the action rows used by the canvas.
 * Persisted rows can lag the canonical occurrence while a Runtime read catches
 * up; rendering only the marker from canonical coordinates leaves the action
 * rectangle behind it. Keep identities and row membership intact, but align
 * rendered intervals to the same canonical half-open occurrence interval.
 */
export function projectCanonicalShotRows(
  rows: readonly TimelineRow[],
  shotGroups: readonly ShotGroup[],
  legacyShellClipIds: ReadonlySet<string> = new Set(),
): TimelineRow[] {
  const geometryByClipId = new Map<string, { start: number; end: number }>();

  for (const group of shotGroups) {
    if (!group.canonicalIdentity || group.clipIds.length === 0 || group.end === undefined) continue;
    const actions = rows
      .flatMap((row) => row.actions)
      .filter((action) => group.clipIds.includes(action.id))
      .sort((left, right) => left.start - right.start || left.id.localeCompare(right.id));
    if (actions.length === 0) continue;
    const occurrenceStart = group.start;
    const occurrenceEnd = Math.max(occurrenceStart, group.end);
    // Canonical child rows already carry authored absolute starts and ends.
    // Re-basing them loses leading gaps and overlaps. Only a legacy shell is
    // an alias for the whole occurrence and receives canonical geometry.
    const onlyActionIsLegacyShell = actions.length === 1
      && legacyShellClipIds.has(actions[0].id);
    if (onlyActionIsLegacyShell) {
      geometryByClipId.set(actions[0].id, { start: occurrenceStart, end: occurrenceEnd });
    }
  }

  if (geometryByClipId.size === 0) {
    return rows.map((row) => ({ ...row, actions: [...row.actions] }));
  }
  return rows.map((row) => ({
    ...row,
    actions: row.actions.map((action) => {
      const geometry = geometryByClipId.get(action.id);
      return geometry ? { ...action, ...geometry } : action;
    }),
  }));
}

export function getShotColor(shotId: string): string {
  let hash = 0;
  for (let index = 0; index < shotId.length; index += 1) {
    hash = ((hash * 31) + shotId.charCodeAt(index)) >>> 0;
  }
  return SHOT_COLORS[hash % SHOT_COLORS.length];
}

export function useShotGroups(
  rows: TimelineRow[],
  documentGroups: readonly TimelineShotGroupView[],
  canonicalOccurrences: readonly CanonicalShotOccurrence[] = [],
  sourceFrameThumbnailUrls?: ReadonlyMap<string, string>,
): ShotGroup[] {
  return useMemo(() => {
    if (canonicalOccurrences.length > 0) {
      return canonicalOccurrences.map((occurrence) => {
        const contentDurationMs = timelineOccurrenceContentExtentMs(occurrence);
        const effectiveOccurrence = {
          ...occurrence,
          durationMs: timelineOccurrenceEffectiveDurationMs(
            occurrence,
            canonicalOccurrences,
            contentDurationMs ?? occurrence.durationMs,
          ),
        };
        // The occurrence is the timing authority. Live projected actions are
        // still useful for child labels/selection, but legacy row geometry must
        // never make the visible shot boundary disagree with the occurrence.
        const occurrencePrefix = `${effectiveOccurrence.occurrenceId}:`;
        const isOccurrenceAction = (action: TimelineRow['actions'][number]) => (
          action.id === occurrence.occurrenceId || action.id.startsWith(occurrencePrefix)
        );
        const liveRows = rows
          .map((row, rowIndex) => ({
            row,
            rowIndex,
            actions: row.actions.filter(isOccurrenceAction),
          }))
          .filter(({ actions }) => actions.length > 0);
        const canonicalStart = effectiveOccurrence.atMs / 1000;
        const canonicalEnd = canonicalStart + effectiveOccurrence.durationMs / 1000;
        // Keep supporting older projected fixtures that do not carry the
        // occurrence-prefixed action id.
        const candidateRows = liveRows.length > 0
          ? liveRows
          : rows
            .map((row, rowIndex) => ({
              row,
              rowIndex,
              actions: row.actions.filter((action) => action.end > canonicalStart && action.start < canonicalEnd),
            }))
            .filter(({ actions }) => actions.length > 0);
        const fallbackRow = rows.find((row) => row.id === effectiveOccurrence.trackId)
          ?? rows.find((row) => row.actions.length > 0)
          ?? rows[0];
        // A full-length parent lane (usually the Frame track) can overlap
        // every occurrence. Prefer the occurrence's declared track before
        // falling back to the first overlapping row, otherwise every shot is
        // incorrectly grouped under that parent lane.
        const selected = candidateRows.find(({ row }) => row.id === effectiveOccurrence.trackId)
          ?? candidateRows[0]
          ?? (fallbackRow ? { row: fallbackRow, rowIndex: rows.indexOf(fallbackRow) } : null);
        const row = selected?.row;
        const rowIndex = selected?.rowIndex ?? 0;
        const liveActions = selected?.actions ?? [];
        const start = canonicalStart;
        const end = canonicalEnd;
        const children = liveActions
          .sort((left, right) => left.start - right.start)
          .map((action) => ({
            clipId: action.id,
            offset: action.start - start,
            duration: action.end - action.start,
          })) ?? [];
        const thumbnailSrc = canonicalShotThumbnailUrl(effectiveOccurrence, sourceFrameThumbnailUrls);
        return {
          shotId: occurrence.shotId,
          shotName: shotNameForOccurrence(occurrence),
          rowId: row?.id ?? effectiveOccurrence.trackId ?? 'V1',
          rowIndex,
          start,
          end,
          clipIds: children.map((child) => child.clipId),
          children,
          color: getShotColor(effectiveOccurrence.occurrenceId),
          mode: 'images' as const,
          poolGenerationIds: [],
          variantIdsByGenerationId: Object.freeze({}),
          ...(thumbnailSrc ? { thumbnailSrc } : {}),
          canonicalIdentity: effectiveOccurrence,
        } satisfies ShotGroup;
      });
    }

    const rowIndexById = new Map(rows.map((row, rowIndex) => [row.id, rowIndex]));

    const result: ShotGroup[] = [];
    for (const group of documentGroups) {
      const placedClipIds = group.placedMembers
        .map((member) => member.clipId)
        .filter((clipId): clipId is string => clipId !== null);
      const resolvedTrackId = rowIndexById.has(group.trackId)
        ? group.trackId
        : rows.find((row) => placedClipIds.some((clipId) => row.actions.some((action) => action.id === clipId)))?.id;
      if (!resolvedTrackId) continue;
      const rowIndex = rowIndexById.get(resolvedTrackId);
      if (typeof rowIndex !== 'number') continue;

      // Soft-tag model: derive children (clipId/offset/duration) from
      // the live row actions, since the data no longer carries them.
      const row = rows[rowIndex];
      if (!row) continue;
      const actionsById = new Map(
        row.actions.map((action) => [action.id, action] as const),
      );
      const liveClipIds = placedClipIds.filter((clipId) => actionsById.has(clipId));
      if (liveClipIds.length === 0 && group.pooledMembers.length === 0) continue;

      const liveActions = liveClipIds
        .map((clipId) => actionsById.get(clipId)!)
        .sort((a, b) => a.start - b.start);
      const firstAction = liveActions[0];
      const groupStart = firstAction?.start ?? 0;
      const children = liveActions.map((action) => ({
        clipId: action.id,
        offset: action.start - groupStart,
        duration: action.end - action.start,
      }));

      result.push({
        shotId: group.shotId,
        shotName: group.name,
        rowId: resolvedTrackId,
        rowIndex,
        start: groupStart,
        clipIds: children.map((child) => child.clipId),
        children,
        color: getShotColor(group.shotId),
        mode: group.mode,
        poolGenerationIds: group.pooledMembers
          .map((member) => member.generationId)
          .filter((generationId): generationId is string => generationId !== null),
        variantIdsByGenerationId: Object.freeze(Object.fromEntries(
          group.members.flatMap((member) => (
            member.generationId && member.variantId
              ? [[member.generationId, member.variantId] as const]
              : []
          )),
        )),
        ...(group.finalVideo ? { finalVideoAssetKey: group.finalVideo.assetKey } : {}),
        ...(group.derivedFrom ? { derivedFrom: group.derivedFrom } : {}),
      });
    }
    return result;
  }, [canonicalOccurrences, documentGroups, rows, sourceFrameThumbnailUrls]);
}

function shotNameForOccurrence(occurrence: CanonicalShotOccurrence): string {
  const canonicalName = occurrence.revision.name;
  if (typeof canonicalName === 'string' && canonicalName.trim()) return canonicalName;
  const provenance = occurrence.revision.provenance;
  if (provenance && typeof provenance === 'object' && !Array.isArray(provenance)) {
    const value = provenance as Record<string, unknown>;
    if (typeof value.name === 'string' && value.name.trim()) return value.name;
    if (typeof value.title === 'string' && value.title.trim()) return value.title;
  }
  const metadata = occurrence.revision.metadata;
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const value = metadata as Record<string, unknown>;
    if (typeof value.name === 'string' && value.name.trim()) return value.name;
    if (typeof value.title === 'string' && value.title.trim()) return value.title;
  }
  return occurrence.shotId;
}
