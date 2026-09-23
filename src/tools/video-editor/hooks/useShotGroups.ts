import { useMemo } from 'react';
import type { TimelineShotGroupView } from '@/tools/video-editor/lib/timeline-domain.ts';
import type { TimelineRow } from '@/tools/video-editor/types/timeline-canvas.ts';
import type { CanonicalShotOccurrence } from '@/tools/video-editor/data/shotCompositionAdapter.ts';
import {
  timelineOccurrenceContentExtentMs,
  timelineOccurrenceEffectiveDurationMs,
} from '@/tools/video-editor/data/shotCompositionTiming.ts';

const SHOT_COLORS = ['#a855f7', '#ef4444', '#22c55e', '#3b82f6', '#f59e0b', '#14b8a6', '#ec4899', '#84cc16'];

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
  canonicalIdentity?: CanonicalShotOccurrence;
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
  }, [canonicalOccurrences, documentGroups, rows]);
}

function shotNameForOccurrence(occurrence: CanonicalShotOccurrence): string {
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
